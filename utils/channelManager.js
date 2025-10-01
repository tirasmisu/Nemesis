const { ChannelType, PermissionFlagsBits } = require('discord.js');
const logger = require('./logger');
const analytics = require('./analytics');

class ChannelManager {
    constructor() {
        this.temporaryChannels = new Map();
        this.eventChannels = new Map();
        this.streamingChannels = new Map();
        this.client = null;
        
        this.channelTypes = {
            EVENT: 'event',
            STREAM: 'stream',
            TEMPORARY: 'temporary',
            DISCUSSION: 'discussion'
        };
        
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredChannels();
        }, 5 * 60 * 1000);
        
        logger.system('CHANNEL_MANAGER', 'Channel manager initialized');
    }

    setClient(client) {
        this.client = client;
    }

    async createEventChannel(guild, eventName, duration, options = {}) {
        try {
            const channelName = `🎬│${eventName.toLowerCase().replace(/\s+/g, '-')}`;
            
            const channel = await guild.channels.create({
                name: channelName,
                type: options.type || ChannelType.GuildText,
                parent: options.categoryId || null,
                topic: options.topic || `Temporary channel for ${eventName} - Auto-deletes in ${this.formatDuration(duration)}`
            });
            
            const channelData = {
                id: channel.id,
                name: eventName,
                type: this.channelTypes.EVENT,
                createdAt: Date.now(),
                expiresAt: Date.now() + duration,
                duration,
                autoDelete: true,
                guild: guild.id
            };
            
            this.eventChannels.set(channel.id, channelData);
            
            setTimeout(async () => {
                await this.deleteTemporaryChannel(channel.id, 'Event ended');
            }, duration);
            
            await logger.system('CHANNEL_MANAGER', 'Event channel created', {
                channelId: channel.id,
                eventName,
                duration: this.formatDuration(duration)
            });
            
            analytics.trackEvent('event_channel_created', {
                eventName,
                channelId: channel.id,
                duration
            });
            
            return channel;
            
        } catch (error) {
            await logger.error('CHANNEL_MANAGER', 'Failed to create event channel', error);
            throw error;
        }
    }

    async createStreamChannel(guild, streamTitle, options = {}) {
        try {
            const channelName = `🔴│${streamTitle.toLowerCase().replace(/\s+/g, '-')}`;
            
            const channel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: options.categoryId || null,
                topic: `🔴 LIVE: ${streamTitle} | Stream discussion and reactions`
            });
            
            const channelData = {
                id: channel.id,
                name: streamTitle,
                type: this.channelTypes.STREAM,
                createdAt: Date.now(),
                isLive: true,
                guild: guild.id,
                streamData: {
                    title: streamTitle,
                    startTime: Date.now()
                }
            };
            
            this.streamingChannels.set(channel.id, channelData);
            
            await logger.system('CHANNEL_MANAGER', 'Stream channel created', {
                channelId: channel.id,
                streamTitle
            });
            
            return channel;
            
        } catch (error) {
            await logger.error('CHANNEL_MANAGER', 'Failed to create stream channel', error);
            throw error;
        }
    }

    async endStream(channelId, streamStats = {}) {
        try {
            const channelData = this.streamingChannels.get(channelId);
            if (!channelData) return;
            
            channelData.isLive = false;
            channelData.streamData.endTime = Date.now();
            channelData.streamData.duration = channelData.streamData.endTime - channelData.streamData.startTime;
            
            const guild = await this.client.guilds.fetch(channelData.guild);
            const channel = guild.channels.cache.get(channelId);
            
            if (channel) {
                await channel.setName(`📺│${channelData.name}-ended`);
                
                setTimeout(async () => {
                    await this.deleteTemporaryChannel(channelId, 'Stream cleanup');
                }, 60 * 60 * 1000);
            }
            
            await logger.system('CHANNEL_MANAGER', 'Stream ended', {
                channelId,
                streamTitle: channelData.name,
                duration: this.formatDuration(channelData.streamData.duration)
            });
            
        } catch (error) {
            await logger.error('CHANNEL_MANAGER', 'Failed to end stream', error);
        }
    }

    async deleteTemporaryChannel(channelId, reason = 'Scheduled deletion') {
        try {
            const channelData = this.getChannelData(channelId);
            if (!channelData) return false;
            
            const guild = await this.client.guilds.fetch(channelData.guild);
            const channel = guild.channels.cache.get(channelId);
            
            if (channel) {
                await channel.delete(reason);
                
                await logger.system('CHANNEL_MANAGER', 'Temporary channel deleted', {
                    channelId,
                    channelName: channelData.name,
                    reason
                });
            }
            
            this.eventChannels.delete(channelId);
            this.streamingChannels.delete(channelId);
            this.temporaryChannels.delete(channelId);
            
            return true;
            
        } catch (error) {
            await logger.error('CHANNEL_MANAGER', 'Failed to delete temporary channel', error);
            return false;
        }
    }

    getChannelData(channelId) {
        return this.eventChannels.get(channelId) ||
               this.streamingChannels.get(channelId) ||
               this.temporaryChannels.get(channelId) ||
               null;
    }

    getStats() {
        return {
            total: this.eventChannels.size + this.streamingChannels.size + this.temporaryChannels.size,
            events: this.eventChannels.size,
            streams: this.streamingChannels.size,
            temporary: this.temporaryChannels.size,
            activeStreams: Array.from(this.streamingChannels.values()).filter(s => s.isLive).length
        };
    }

    async cleanupExpiredChannels() {
        const now = Date.now();
        const toDelete = [];
        
        for (const [channelId, channelData] of this.eventChannels.entries()) {
            if (channelData.expiresAt && now >= channelData.expiresAt) {
                toDelete.push({ channelId, reason: 'Event expired' });
            }
        }
        
        if (toDelete.length > 0) {
            await logger.system('CHANNEL_MANAGER', `Cleaning up ${toDelete.length} expired channels`);
            
            for (const { channelId, reason } of toDelete) {
                await this.deleteTemporaryChannel(channelId, reason);
            }
        }
    }

    formatDuration(milliseconds) {
        const minutes = Math.floor(milliseconds / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else {
            return `${minutes}m`;
        }
    }

    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        logger.system('CHANNEL_MANAGER', 'Channel manager destroyed');
    }
}

module.exports = new ChannelManager(); 
