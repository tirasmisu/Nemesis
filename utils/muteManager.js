const { EmbedBuilder } = require('discord.js');
const logger = require('./logger');

// Store active mutes
const activeMutes = new Map();

// Initialize mute manager
async function initializeMuteManager(client) {
    try {
        // Validate database connection first
        const database = require('./database');
        
        // Check if database is properly connected using Mongoose
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) {
            console.warn('[MuteManager] Database not connected, skipping mute restoration');
            await logger.warn('MUTE_MANAGER', 'Database not connected, skipping mute restoration');
            return;
        }
        
        await database.validateConnection();
        
        // Load existing mutes from database using Mongoose
        const ModerationAction = require('../models/ModerationAction');
        
        // Ensure the model is properly initialized
        if (!ModerationAction) {
            throw new Error('ModerationAction model not properly initialized');
        }
        
        // Find all active mutes using Mongoose model
        const mutes = await ModerationAction.find({ 
            action: 'mute', 
            active: true 
        });
        
        for (const mute of mutes) {
            scheduleUnmute(client, mute);
        }
        
        // Set up periodic check every hour to catch any missed unmutes
        setInterval(() => {
            console.log('[MuteManager] Running hourly expired mute check...');
            cleanupExpiredMutes(client);
        }, 60 * 60 * 1000); // 1 hour
        
        await logger.system('MUTE_MANAGER', `Mute manager initialized with ${mutes.length} active mutes`);
        console.log('[MuteManager] Hourly expired mute check scheduled');
    } catch (error) {
        await logger.error('MUTE_MANAGER', 'Failed to initialize mute manager', error);
        
        // Don't crash the bot - just log the error and continue
        console.error('[MuteManager] Mute manager initialization failed:', error.message);
        console.log('[MuteManager] Bot will continue without mute manager - mutes may not work properly');
    }
}

// Schedule unmute
function scheduleUnmute(client, mute) {
    const { userId, actionId, duration, timestamp } = mute;
    
    // Skip logging and return early for permanent/forever mutes
    if (duration === 'permanent' || duration === 'forever') {
        return;
    }
    
    console.log(`[MuteManager] scheduleUnmute called for user ${userId}, actionId ${actionId}, duration ${duration}`);
    
    // Parse duration string (e.g., "10m", "1h", "30s") and calculate end time
    let endTime;
    if (duration) {
        const ms = require('ms');
        const durationMs = ms(duration);
        if (durationMs) {
            endTime = new Date(timestamp).getTime() + durationMs;
            console.log(`[MuteManager] Unmute scheduled for ${new Date(endTime).toISOString()}`);
        } else {
            console.warn(`[MuteManager] Invalid duration format: ${duration} for mute ${actionId}`);
            return;
        }
    } else {
        // No duration - don't schedule unmute (skip silently)
        return;
    }
    
    // Calculate time until unmute
    const timeUntilUnmute = endTime - Date.now();
    
    console.log(`[MuteManager] Time until unmute: ${timeUntilUnmute}ms (${Math.round(timeUntilUnmute/1000)}s)`);
    
    if (timeUntilUnmute <= 0) {
        // Unmute immediately if time has passed
        console.log(`[MuteManager] Mute already expired, unmuting immediately`);
        unmuteUser(client, mute);
    } else {
        // Schedule unmute
        const timeout = setTimeout(() => {
            console.log(`[MuteManager] Timer fired for ${actionId}, unmuting now`);
            unmuteUser(client, mute);
        }, timeUntilUnmute);
        
        // Store timeout reference using actionId instead of guildId-userId
        activeMutes.set(actionId, timeout);
        console.log(`[MuteManager] Timer set for ${actionId}, stored in activeMutes`);
    }
}

// Mute user
async function muteUser(guild, user, duration, reason, executor) {
    try {
        // Get the channel ID from the channels config
        const channelConfig = require('../config/channels');
        const logChannelId = channelConfig.getId('MODERATION_LOG');
        const logChannel = guild.channels.cache.get(logChannelId);
        
        if (!logChannel) {
            throw new Error('Log channel not found');
        }

        // ... rest of mute logic ...

        // Log the mute action
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('User Muted')
            .setDescription(`**User:** ${user.tag}\n**Reason:** ${reason}\n**Duration:** ${formatDuration(duration)}`)
            .setTimestamp();

        await logChannel.send({ embeds: [embed] });

        return true;
    } catch (error) {
        console.error('Failed to mute user:', error);
        return false;
    }
}

// Handle automated unmutes from the scheduler
async function unmuteUser(client, mute) {
    try {
        const { userId, actionId } = mute;
        
        console.log(`[MuteManager] Processing automatic unmute for userId: ${userId}, actionId: ${actionId}`);
        
        // Update the mute record in the database to inactive using Mongoose
        const ModerationAction = require('../models/ModerationAction');
        await ModerationAction.findOneAndUpdate(
            { userId, action: 'mute', actionId, active: true },
            { active: false }
        );
        
        // Clear the timeout from our tracking map
        activeMutes.delete(actionId);
        
        // Get role config to find mute role
        const roleConfig = require('../config/roles');
        
        // Fetch the guild (assuming there's only one guild - modify if multi-guild)
        const guild = client.guilds.cache.first();
        
        if (!guild) {
            throw new Error('Could not find guild');
        }
        
        const member = await guild.members.fetch(userId).catch(err => {
            // Only log if it's not a "member left server" error
            if (err.code !== 10007) {
                console.error(`[MuteManager] Failed to fetch member ${userId}:`, err);
            }
            return null;
        });
        
        if (member) {
            // Get mute role from config
            const muteRoleId = roleConfig.getId('MUTED');
            if (muteRoleId) {
                // Remove the mute role if the member is still in the server
                await member.roles.remove(muteRoleId).catch(err => {
                    console.error(`[MuteManager] Failed to remove mute role ${muteRoleId} from ${userId}:`, err);
                });
                
                console.log(`[MuteManager] Successfully removed mute role from ${member.user.tag}`);
            } else {
                console.warn('[MuteManager] Mute role not found in config');
            }
        } else {
            // User left the server, but we still processed the unmute in database
            console.log(`[MuteManager] User ${userId} left the server - mute expired and marked inactive in database`);
        }
        
        // Log the unmute to the moderation log channel
        const channelConfig = require('../config/channels');
        const logChannelId = channelConfig.getId('MODERATION_LOG');
        const logChannel = guild.channels.cache.get(logChannelId);
        
        if (logChannel) {
            const user = member ? member.user : await client.users.fetch(userId).catch(() => null);
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('🔊 Auto-Unmute')
                .setDescription(`**User:** <@${userId}>${user ? ` (${user.tag})` : ''}\n**Reason:** Mute duration expired`)
                .setFooter({ text: `Original Punishment ID: ${actionId || mute.punishmentId || 'Unknown'}` })
                .setTimestamp();
                
            if (user && user.displayAvatarURL) {
                embed.setThumbnail(user.displayAvatarURL({ dynamic: true }));
            }
            
            await logChannel.send({ embeds: [embed] });
        }
        
        return true;
    } catch (error) {
        console.error('[MuteManager] Failed to process auto-unmute:', error);
        await logger.error('MUTE_MANAGER', 'Error in auto unmute process', error);
        return false;
    }
}

// Manual unmute by moderator
async function manualUnmute(guild, user, reason, executor) {
    try {
        console.log(`[MuteManager] Manual unmute requested for ${user.tag} by ${executor.tag}`);
        
        // Clear any active timeout for this user
        const ModerationAction = require('../models/ModerationAction');
        const activeMute = await ModerationAction.findOne({
            userId: user.id,
            action: 'mute',
            active: true
        });
        
        if (activeMute) {
            // Clear the timeout if it exists
            const timeout = activeMutes.get(activeMute.actionId);
            if (timeout) {
                clearTimeout(timeout);
                activeMutes.delete(activeMute.actionId);
                console.log(`[MuteManager] Cleared active timeout for ${user.tag}, actionId: ${activeMute.actionId}`);
            }
        }
        
        // Get the channel ID from the channels config
        const channelConfig = require('../config/channels');
        const logChannelId = channelConfig.getId('MODERATION_LOG');
        const logChannel = guild.channels.cache.get(logChannelId);
        
        if (logChannel) {
            // Log the manual unmute action
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('🔊 Manual Unmute')
                .setDescription(`**User:** ${user.tag}\n**Reason:** ${reason}\n**Moderator:** ${executor.tag}`)
                .setTimestamp();

            await logChannel.send({ embeds: [embed] });
        }

        return true;
    } catch (error) {
        console.error('[MuteManager] Failed to process manual unmute:', error);
        return false;
    }
}

// Get active mutes
async function getActiveMutes(client, guildId) {
    try {
        const ModerationAction = require('../models/ModerationAction');
        return await ModerationAction.find({ 
            action: 'mute', 
            active: true 
        });
    } catch (error) {
        await logger.error('MUTE_MANAGER', 'Error getting active mutes', error);
        throw error;
    }
}

// Get user's active mute
async function getUserMute(client, userId, guildId) {
    try {
        const ModerationAction = require('../models/ModerationAction');
        return await ModerationAction.findOne({ 
            userId, 
            action: 'mute', 
            active: true 
        });
    } catch (error) {
        await logger.error('MUTE_MANAGER', 'Error getting user mute', error);
        throw error;
    }
}

// Helper function to format duration
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours % 24 > 0) parts.push(`${hours % 24}h`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
    if (seconds % 60 > 0) parts.push(`${seconds % 60}s`);
    
    return parts.join(' ');
}

// Simple hourly cleanup function for expired mutes only
async function cleanupExpiredMutes(client) {
    try {
        const ModerationAction = require('../models/ModerationAction');
        const roleConfig = require('../config/roles');
        const ms = require('ms');
        
        console.log('[MuteManager] Starting hourly cleanup of expired mutes...');
        
        // Get all active mutes
        const activeMutes = await ModerationAction.find({ 
            action: 'mute', 
            active: true 
        });
        
        console.log(`[MuteManager] Found ${activeMutes.length} active mutes in database`);
        
        const guild = client.guilds.cache.first();
        if (!guild) {
            console.error('[MuteManager] No guild found for cleanup');
            return 0;
        }
        
        const muteRoleId = roleConfig.getId('MUTED');
        if (!muteRoleId) {
            console.error('[MuteManager] Mute role not found in config');
            return 0;
        }
        
        let cleanedCount = 0;
        
        for (const mute of activeMutes) {
            const { userId, actionId, duration, timestamp } = mute;
            
            // Skip permanent/forever mutes
            if (!duration || duration === 'permanent' || duration === 'forever') {
                continue;
            }
            
            // Parse duration and check if expired
            const durationMs = ms(duration);
            if (!durationMs) {
                console.log(`[MuteManager] Invalid duration format: ${duration} for mute ${actionId} - skipping`);
                continue;
            }
            
            const endTime = new Date(timestamp).getTime() + durationMs;
            const now = Date.now();
            
            if (now >= endTime) {
                // This mute has expired, clean it up
                console.log(`[MuteManager] Found expired mute for user ${userId}, cleaning up...`);
                
                // Update database
                await ModerationAction.findOneAndUpdate(
                    { userId, action: 'mute', actionId, active: true },
                    { active: false }
                );
                
                // Remove role from user if they're still in server
                try {
                    const member = await guild.members.fetch(userId);
                    if (member && member.roles.cache.has(muteRoleId)) {
                        await member.roles.remove(muteRoleId);
                        console.log(`[MuteManager] Removed expired mute role from ${member.user.tag}`);
                        cleanedCount++;
                    }
                } catch (err) {
                    if (err.code !== 10007) { // Don't log if user left server
                        console.error(`[MuteManager] Error removing role from ${userId}:`, err);
                    } else {
                        console.log(`[MuteManager] User ${userId} left server - marked mute as inactive`);
                        cleanedCount++;
                    }
                }
            }
        }
        
        console.log(`[MuteManager] Hourly cleanup complete - processed ${cleanedCount} expired mutes`);
        return cleanedCount;
        
    } catch (error) {
        console.error('[MuteManager] Error during hourly cleanup:', error);
        return 0;
    }
}

module.exports = {
    initializeMuteManager,
    muteUser,
    unmuteUser,
    manualUnmute,
    getActiveMutes,
    getUserMute,
    scheduleUnmute,
    cleanupExpiredMutes
}; 
