const { Events, EmbedBuilder } = require('discord.js');
const { handleVoiceJoin, handleVoiceLeave } = require('../services/xpService');
const { 
    handleJoinToCreate,
    handleChannelLeave,
    handleChannelJoin
} = require('../services/voiceChannelService');
const { handleAutoMove } = require('../services/invitationService');
const { handleJoinRequestAutoMove } = require('../services/joinRequestService');
const channelConfig = require('../config/channels');
const roleConfig = require('../config/roles');

class VoiceStateUpdateEvent {
    constructor() {
        this.name = Events.VoiceStateUpdate;
        this.once = false;
    }

    async execute(oldState, newState, client) {
        try {
            // Skip if user is a bot
            if (oldState.member.user.bot || newState.member.user.bot) return;
            
            const userId = oldState.member.id;
            const guildId = oldState.guild.id;
            const member = newState.member || oldState.member;
            const guild = member.guild;
            
            // Debug logging
            console.log(`[VoiceStateUpdate] Processing voice state change for ${member.user.tag}`);
            console.log(`[VoiceStateUpdate] Old channel: ${oldState.channelId}, New channel: ${newState.channelId}`);
            
            // User joined a voice channel
            if (!oldState.channelId && newState.channelId) {
                console.log(`[VoiceStateUpdate] ${member.user.tag} joined voice channel: ${newState.channel.name}`);
                
                // Log voice channel join
                await this.logVoiceActivity(guild, member, 'join', null, newState.channel);
                
                // Add In VC role
                await this.addInVcRole(member);
                
                // Handle auto-move for invitations (check before other processing)
                await handleAutoMove(newState.member, newState.channel);
                
                // Handle auto-move for join requests (check before other processing)
                await handleJoinRequestAutoMove(newState.member, newState.channel);
                
                // Handle XP for voice join
                await handleVoiceJoin(userId, guildId, newState.channelId);
                
                // Handle Join to Create functionality
                await handleJoinToCreate(newState.member, newState.channel, client);
                
                // Handle someone joining an existing voice channel
                await handleChannelJoin(newState.channel);
            }
            // User left a voice channel
            else if (oldState.channelId && !newState.channelId) {
                console.log(`[VoiceStateUpdate] ${member.user.tag} left voice channel: ${oldState.channel.name}`);
                
                // Log voice channel leave
                await this.logVoiceActivity(guild, member, 'leave', oldState.channel, null);
                
                // Remove In VC role
                await this.removeInVcRole(member);
                
                // Handle XP for voice leave
                await handleVoiceLeave(userId, guildId, client);
                
                // Handle leaving a voice channel (potential cleanup)
                await handleChannelLeave(oldState.channel, oldState.member);
            }
            // User moved voice channels
            else if (oldState.channelId !== newState.channelId) {
                console.log(`[VoiceStateUpdate] ${member.user.tag} moved from ${oldState.channel.name} to ${newState.channel.name}`);
                
                // Log voice channel move
                await this.logVoiceActivity(guild, member, 'move', oldState.channel, newState.channel);
                
                // Sync In VC role (should still have it since they're still in voice)
                await this.syncInVcRole(member);
                
                // Handle auto-move for invitations (check before other processing)
                await handleAutoMove(newState.member, newState.channel);
                
                // Handle auto-move for join requests (check before other processing)
                await handleJoinRequestAutoMove(newState.member, newState.channel);
                
                // Handle XP as a leave from old channel and join to new
                await handleVoiceLeave(userId, guildId, client);
                await handleVoiceJoin(userId, guildId, newState.channelId);
                
                // Handle Join to Create for new channel
                await handleJoinToCreate(newState.member, newState.channel, client);
                
                // Handle someone joining the new voice channel
                await handleChannelJoin(newState.channel);
                
                // Handle leaving the old channel (potential cleanup)
                await handleChannelLeave(oldState.channel, oldState.member);
            }
        } catch (error) {
            console.error('[VoiceStateUpdate] Error handling voice state update:', error);
            
            // In case of errors, try to sync the In VC role as a fallback
            try {
                const member = newState.member || oldState.member;
                if (member) {
                    await this.syncInVcRole(member);
                }
            } catch (syncError) {
                console.error('[VoiceStateUpdate] Error syncing In VC role during error recovery:', syncError);
            }
        }
    }

    /**
     * Log voice channel activity to the VC_LOG channel
     */
    async logVoiceActivity(guild, member, action, oldChannel = null, newChannel = null) {
        try {
            const vcLogChannelId = channelConfig.getId('VC_LOG');
            const vcLogChannel = guild.channels.cache.get(vcLogChannelId);
            
            if (!vcLogChannel) {
                console.warn(`[VoiceStateUpdate] VC_LOG channel not found or not accessible. Channel ID: ${vcLogChannelId}`);
                return;
            }
            
            // Check if bot has permission to send messages
            if (!vcLogChannel.permissionsFor(guild.members.me).has('SendMessages')) {
                console.warn(`[VoiceStateUpdate] Bot does not have permission to send messages in VC_LOG channel`);
                return;
            }

            let embed;
            const timestamp = new Date();

            switch (action) {
                case 'join':
                    embed = new EmbedBuilder()
                        .setColor(0x00FF00) // Green for join
                        .setTitle('📞 Voice Channel Join')
                        .setDescription(`**${member.user.tag}** joined **${newChannel.name}**`)
                        .addFields(
                            { name: 'User', value: `<@${member.id}>`, inline: true },
                            { name: 'Channel', value: `<#${newChannel.id}>`, inline: true },
                            { name: 'Members in VC', value: `${newChannel.members.size}`, inline: true }
                        )
                        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                        .setTimestamp(timestamp);
                    break;

                case 'leave':
                    embed = new EmbedBuilder()
                        .setColor(0xFF0000) // Red for leave
                        .setTitle('📞 Voice Channel Leave')
                        .setDescription(`**${member.user.tag}** left **${oldChannel.name}**`)
                        .addFields(
                            { name: 'User', value: `<@${member.id}>`, inline: true },
                            { name: 'Channel', value: `<#${oldChannel.id}>`, inline: true },
                            { name: 'Members in VC', value: `${oldChannel.members.size}`, inline: true }
                        )
                        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                        .setTimestamp(timestamp);
                    break;

                case 'move':
                    embed = new EmbedBuilder()
                        .setColor(0xFFFF00) // Yellow for move
                        .setTitle('📞 Voice Channel Move')
                        .setDescription(`**${member.user.tag}** moved from **${oldChannel.name}** to **${newChannel.name}**`)
                        .addFields(
                            { name: 'User', value: `<@${member.id}>`, inline: true },
                            { name: 'From', value: `<#${oldChannel.id}>`, inline: true },
                            { name: 'To', value: `<#${newChannel.id}>`, inline: true }
                        )
                        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                        .setTimestamp(timestamp);
                    break;

                default:
                    console.warn(`[VoiceStateUpdate] Unknown action type: ${action}`);
                    return;
            }

            await vcLogChannel.send({ embeds: [embed] });
            console.log(`[VoiceStateUpdate] Logged ${action} for ${member.user.tag}`);

        } catch (error) {
            console.error('[VoiceStateUpdate] Error logging voice activity:', error);
        }
    }

    /**
     * Add the "In VC" role to a member
     */
    async addInVcRole(member) {
        try {
            const inVcRoleId = roleConfig.getId('IN_VC');
            
            if (!inVcRoleId) {
                console.warn('[VoiceStateUpdate] IN_VC role ID not found in configuration');
                return false;
            }

            // Check if member already has the role
            if (member.roles.cache.has(inVcRoleId)) {
                console.log(`[VoiceStateUpdate] ${member.user.tag} already has In VC role`);
                return true;
            }

            await member.roles.add(inVcRoleId, 'User joined voice channel');
            console.log(`[VoiceStateUpdate] Added In VC role to ${member.user.tag}`);
            return true;

        } catch (error) {
            console.error(`[VoiceStateUpdate] Error adding In VC role to ${member.user.tag}:`, error);
            return false;
        }
    }

    /**
     * Remove the "In VC" role from a member
     */
    async removeInVcRole(member) {
        try {
            const inVcRoleId = roleConfig.getId('IN_VC');
            
            if (!inVcRoleId) {
                console.warn('[VoiceStateUpdate] IN_VC role ID not found in configuration');
                return false;
            }

            // Check if member has the role
            if (!member.roles.cache.has(inVcRoleId)) {
                console.log(`[VoiceStateUpdate] ${member.user.tag} doesn't have In VC role`);
                return true;
            }

            await member.roles.remove(inVcRoleId, 'User left voice channel');
            console.log(`[VoiceStateUpdate] Removed In VC role from ${member.user.tag}`);
            return true;

        } catch (error) {
            console.error(`[VoiceStateUpdate] Error removing In VC role from ${member.user.tag}:`, error);
            return false;
        }
    }

    /**
     * Sync the "In VC" role for a member based on their current voice state
     */
    async syncInVcRole(member) {
        try {
            const shouldHave = member.voice.channel !== null;
            const inVcRoleId = roleConfig.getId('IN_VC');
            const hasRole = member.roles.cache.has(inVcRoleId);

            if (shouldHave && !hasRole) {
                return await this.addInVcRole(member);
            } else if (!shouldHave && hasRole) {
                return await this.removeInVcRole(member);
            }

            return true; // No change needed
        } catch (error) {
            console.error(`[VoiceStateUpdate] Error syncing In VC role for ${member.user.tag}:`, error);
            return false;
        }
    }
}

module.exports = new VoiceStateUpdateEvent();
