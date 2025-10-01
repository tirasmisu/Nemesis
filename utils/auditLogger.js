const { EmbedBuilder } = require('discord.js');
const logger = require('./logger');
const { getChannel } = require('../config/channels');
const { createSmartUserMention } = require('./utils');

// Action types
const ACTION_TYPES = {
    MODERATION: 'moderation',
    ROLE: 'role',
    CHANNEL: 'channel',
    SERVER: 'server',
    SYSTEM: 'system'
};

// Create audit log entry
async function createAuditLog({ type, action, targetId, executorId, reason, details, guildId }) {
    try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) return null;

        // Get log channel using the new configuration
        const logChannel = getChannel(guild, 'MODERATION_LOG');
        if (!logChannel) return null;

        // Create embed based on action type
        const embed = await createAuditEmbed(type, action, targetId, executorId, reason, details, client, guild);
        
        // Send embed to log channel
        await logChannel.send({ embeds: [embed] });
        
        // Store log entry in database
        await storeAuditLog({
            type,
            action,
            targetId,
            executorId,
            reason,
            details,
            guildId,
            timestamp: new Date()
        });
        
        return true;
    } catch (error) {
        console.error('Failed to create audit log:', error);
        return false;
    }
}

// Create audit embed
async function createAuditEmbed(type, action, targetId, executorId, reason, details, client, guild) {
    const embed = new EmbedBuilder()
        .setTimestamp();
    
    // Set color based on action type
    switch (type) {
        case ACTION_TYPES.MODERATION:
            embed.setColor(0xFF0000);
            break;
        case ACTION_TYPES.ROLE:
            embed.setColor(0x00FF00);
            break;
        case ACTION_TYPES.CHANNEL:
            embed.setColor(0x0000FF);
            break;
        case ACTION_TYPES.SERVER:
            embed.setColor(0xFF00FF);
            break;
        case ACTION_TYPES.SYSTEM:
            embed.setColor(0xFFFF00);
            break;
        default:
            embed.setColor(0x808080);
    }
    
    // Set title and fields based on action
    switch (action) {
        case 'ban':
            {
                const userMention = await createSmartUserMention(targetId, client, guild, { showRawId: true });
                const moderatorMention = await createSmartUserMention(executorId, client, guild, { showRawId: true });
                embed.setTitle('User Banned')
                    .addFields(
                        { name: 'User', value: userMention, inline: true },
                        { name: 'Moderator', value: moderatorMention, inline: true },
                        { name: 'Reason', value: reason || 'No reason provided' }
                    );
            }
            break;
            
        case 'unban':
            {
                const userMention = await createSmartUserMention(targetId, client, guild, { showRawId: true });
                const moderatorMention = await createSmartUserMention(executorId, client, guild, { showRawId: true });
                embed.setTitle('User Unbanned')
                    .addFields(
                        { name: 'User', value: userMention, inline: true },
                        { name: 'Moderator', value: moderatorMention, inline: true },
                        { name: 'Reason', value: reason || 'No reason provided' }
                    );
            }
            break;
            
        case 'kick':
            {
                const userMention = await createSmartUserMention(targetId, client, guild, { showRawId: true });
                const moderatorMention = await createSmartUserMention(executorId, client, guild, { showRawId: true });
                embed.setTitle('User Kicked')
                    .addFields(
                        { name: 'User', value: userMention, inline: true },
                        { name: 'Moderator', value: moderatorMention, inline: true },
                        { name: 'Reason', value: reason || 'No reason provided' }
                    );
            }
            break;
            
        case 'mute':
            {
                const userMention = await createSmartUserMention(targetId, client, guild, { showRawId: true });
                const moderatorMention = await createSmartUserMention(executorId, client, guild, { showRawId: true });
                embed.setTitle('User Muted')
                    .addFields(
                        { name: 'User', value: userMention, inline: true },
                        { name: 'Moderator', value: moderatorMention, inline: true },
                        { name: 'Duration', value: details.duration || 'Unknown', inline: true },
                        { name: 'Reason', value: reason || 'No reason provided' }
                    );
            }
            break;
            
        case 'unmute':
            {
                const userMention = await createSmartUserMention(targetId, client, guild, { showRawId: true });
                const moderatorMention = await createSmartUserMention(executorId, client, guild, { showRawId: true });
                embed.setTitle('User Unmuted')
                    .addFields(
                        { name: 'User', value: userMention, inline: true },
                        { name: 'Moderator', value: moderatorMention, inline: true },
                        { name: 'Reason', value: reason || 'No reason provided' }
                    );
            }
            break;
            
        case 'warn':
            {
                const userMention = await createSmartUserMention(targetId, client, guild, { showRawId: true });
                const moderatorMention = await createSmartUserMention(executorId, client, guild, { showRawId: true });
                embed.setTitle('User Warned')
                    .addFields(
                        { name: 'User', value: userMention, inline: true },
                        { name: 'Moderator', value: moderatorMention, inline: true },
                        { name: 'Reason', value: reason || 'No reason provided' }
                    );
            }
            break;
            
        case 'role_add':
            {
                const userMention = await createSmartUserMention(targetId, client, guild, { showRawId: true });
                const moderatorMention = await createSmartUserMention(executorId, client, guild, { showRawId: true });
                embed.setTitle('Role Added')
                    .addFields(
                        { name: 'User', value: userMention, inline: true },
                        { name: 'Moderator', value: moderatorMention, inline: true },
                        { name: 'Role', value: `<@&${details.roleId}>`, inline: true },
                        { name: 'Reason', value: reason || 'No reason provided' }
                    );
            }
            break;
            
        case 'role_remove':
            {
                const userMention = await createSmartUserMention(targetId, client, guild, { showRawId: true });
                const moderatorMention = await createSmartUserMention(executorId, client, guild, { showRawId: true });
                embed.setTitle('Role Removed')
                    .addFields(
                        { name: 'User', value: userMention, inline: true },
                        { name: 'Moderator', value: moderatorMention, inline: true },
                        { name: 'Role', value: `<@&${details.roleId}>`, inline: true },
                        { name: 'Reason', value: reason || 'No reason provided' }
                    );
            }
            break;
            
        case 'channel_create':
            {
                const creatorMention = await createSmartUserMention(executorId, client, guild, { showRawId: true });
                embed.setTitle('Channel Created')
                    .addFields(
                        { name: 'Channel', value: `<#${targetId}>`, inline: true },
                        { name: 'Created By', value: creatorMention, inline: true },
                        { name: 'Type', value: details.type || 'Unknown', inline: true }
                    );
            }
            break;
            
        case 'channel_delete':
            {
                const deleterMention = await createSmartUserMention(executorId, client, guild, { showRawId: true });
                embed.setTitle('Channel Deleted')
                    .addFields(
                        { name: 'Channel Name', value: details.name || 'Unknown', inline: true },
                        { name: 'Deleted By', value: deleterMention, inline: true },
                        { name: 'Type', value: details.type || 'Unknown', inline: true }
                    );
            }
            break;
            
        case 'server_update':
            {
                const updaterMention = await createSmartUserMention(executorId, client, guild, { showRawId: true });
                embed.setTitle('Server Updated')
                    .addFields(
                        { name: 'Updated By', value: updaterMention, inline: true },
                        { name: 'Changes', value: formatChanges(details.changes) }
                    );
            }
            break;
            
        case 'system_error':
            embed.setTitle('System Error')
                .setColor(0xFF0000)
                .addFields(
                    { name: 'Error Type', value: details.errorType || 'Unknown', inline: true },
                    { name: 'Context', value: details.context || 'No context provided' }
                );
            break;
            
        default:
            {
                const targetMention = await createSmartUserMention(targetId, client, guild, { showRawId: true });
                const executorMention = await createSmartUserMention(executorId, client, guild, { showRawId: true });
                embed.setTitle('Action Logged')
                    .addFields(
                        { name: 'Action', value: action, inline: true },
                        { name: 'Target', value: targetMention, inline: true },
                        { name: 'Executor', value: executorMention, inline: true },
                        { name: 'Details', value: JSON.stringify(details, null, 2) }
                    );
            }
    }
    
    return embed;
}

// Format changes for server update logs
function formatChanges(changes) {
    if (!changes || !Array.isArray(changes)) {
        return 'No changes recorded';
    }
    
    return changes.map(change => {
        return `**${change.key}**: ${change.old} → ${change.new}`;
    }).join('\n');
}

// Get audit logs
async function getAuditLogs(client, options) {
    const {
        guildId,
        type,
        action,
        targetId,
        executorId,
        startTime,
        endTime,
        limit = 100
    } = options;
    
    try {
        const query = { guildId };
        
        if (type) query.type = type;
        if (action) query.action = action;
        if (targetId) query.targetId = targetId;
        if (executorId) query.executorId = executorId;
        if (startTime || endTime) {
            query.timestamp = {};
            if (startTime) query.timestamp.$gte = startTime;
            if (endTime) query.timestamp.$lte = endTime;
        }
        
        return await client.db.collection('audit_logs')
            .find(query)
            .sort({ timestamp: -1 })
            .limit(limit)
            .toArray();
    } catch (error) {
        await logger.error('AUDIT_LOGGER', 'Error getting audit logs', error);
        throw error;
    }
}

module.exports = {
    ACTION_TYPES,
    createAuditLog,
    getAuditLogs
}; 
