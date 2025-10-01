const { EmbedBuilder } = require('discord.js');
const { generateUniquePunishmentId } = require('../utils/generatePunishmentId');
const { saveModerationAction } = require('./moderationActionService');
const { notifyUser, createSmartUserMention } = require('../utils/utils');
const channelConfig = require('../config/channels');
const roleConfig = require('../config/roles');

// Track user link activity across channels
const userLinkActivity = new Map(); // userId -> { channels: Set, messages: Array, firstDetection: timestamp }

// Statistics tracking
const detectionStats = {
    totalDetections: 0,
    usersKicked: 0,
    lastDetection: null,
    detectionsByDate: new Map() // date -> count
};

// Dynamic configuration (can be updated by the config command)
let DETECTION_CONFIG = {
    // If user sends links to X+ different channels within Y minutes, trigger detection
    channelThreshold: 3,        // 3+ different channels
    timeWindow: 5 * 60 * 1000,  // 5 minutes in milliseconds
    maxMessages: 5,             // Track last 5 messages per user
    enabled: true,              // Whether detection is enabled
    
    // Whitelist patterns (legitimate links that shouldn't trigger detection)
    whitelistedDomains: [
        'discord.gg',
        'discord.com',
        'youtube.com',
        'youtu.be',
        'twitch.tv',
        'twitter.com',
        'x.com',
        'github.com',
        'reddit.com'
    ]
};

/**
 * Check if message contains links and update user tracking
 * @param {Message} message - Discord message object
 * @returns {Promise<boolean>} Whether user was detected as compromised and kicked
 */
async function checkForCompromisedAccount(message) {
    try {
        // Skip if detection is disabled
        if (!DETECTION_CONFIG.enabled) return false;
        
        // Skip if user is staff (they should be trusted)
        if (isStaffExempt(message.member)) return false;
        
        // Skip if message doesn't contain links
        if (!containsLinks(message.content)) return false;
        
        // Skip if links are all whitelisted
        if (areAllLinksWhitelisted(message.content)) return false;
        
        const userId = message.author.id;
        const channelId = message.channel.id;
        const now = Date.now();
        
        // Get or create user activity tracking
        if (!userLinkActivity.has(userId)) {
            userLinkActivity.set(userId, {
                channels: new Set(),
                messages: [],
                firstDetection: now
            });
        }
        
        const userActivity = userLinkActivity.get(userId);
        
        // Clean old messages outside time window
        userActivity.messages = userActivity.messages.filter(msg => 
            now - msg.timestamp < DETECTION_CONFIG.timeWindow
        );
        
        // Add current message
        userActivity.channels.add(channelId);
        userActivity.messages.push({
            channelId,
            timestamp: now,
            content: message.content.substring(0, 100), // Store snippet for logging
            messageId: message.id
        });
        
        // Keep only recent messages
        if (userActivity.messages.length > DETECTION_CONFIG.maxMessages) {
            userActivity.messages = userActivity.messages.slice(-DETECTION_CONFIG.maxMessages);
        }
        
        // Update channel set based on recent messages
        userActivity.channels.clear();
        userActivity.messages.forEach(msg => userActivity.channels.add(msg.channelId));
        
        console.log(`[COMPROMISE_DETECTION] User ${message.author.tag} has sent links in ${userActivity.channels.size} channels`);
        
        // Check if threshold is met
        if (userActivity.channels.size >= DETECTION_CONFIG.channelThreshold) {
            console.log(`[COMPROMISE_DETECTION] 🚨 Detected compromised account: ${message.author.tag} (${userActivity.channels.size} channels)`);
            
            // Update statistics
            detectionStats.totalDetections++;
            detectionStats.lastDetection = new Date();
            
            const today = new Date().toDateString();
            const todayCount = detectionStats.detectionsByDate.get(today) || 0;
            detectionStats.detectionsByDate.set(today, todayCount + 1);
            
            // Trigger compromise response
            const kickSuccessful = await handleCompromisedAccount(message, userActivity);
            if (kickSuccessful) {
                detectionStats.usersKicked++;
            }
            
            // Clean up tracking for this user
            userLinkActivity.delete(userId);
            
            return true;
        }
        
        return false;
        
    } catch (error) {
        console.error('[COMPROMISE_DETECTION] Error in checkForCompromisedAccount:', error);
        return false;
    }
}

/**
 * Handle a detected compromised account
 * @param {Message} message - The triggering message
 * @param {Object} userActivity - User's tracked activity
 */
async function handleCompromisedAccount(message, userActivity) {
    try {
        const user = message.author;
        const guild = message.guild;
        const member = message.member;
        
        const punishmentId = await generateUniquePunishmentId();
        const reason = `[AUTOMOD] Compromised account detected - Links sent across ${userActivity.channels.size} channels`;
        
        let kickSuccessful = false;
        
        // Try to kick the user
        try {
            await member.kick(reason);
            console.log(`[COMPROMISE_DETECTION] ✅ Successfully kicked ${user.tag}`);
            kickSuccessful = true;
        } catch (kickError) {
            console.error(`[COMPROMISE_DETECTION] ❌ Failed to kick ${user.tag}:`, kickError);
            // Still log the detection even if kick fails
        }
        
        // Try to notify the user
        const dmSent = await notifyUser(user, guild, 'kicked', null, 'Your account appears to have been compromised and was automatically removed for security. If this was a mistake, please contact the staff team.');
        
        // Save moderation action
        await saveModerationAction({
            userId: user.id,
            moderatorId: message.client.user.id, // Bot as moderator
            action: 'kick',
            reason,
            actionId: punishmentId,
            timestamp: new Date(),
            metadata: {
                automod: true,
                compromiseDetection: true,
                channelsAffected: Array.from(userActivity.channels),
                messageCount: userActivity.messages.length,
                notified: dmSent
            }
        });
        
        // Log to moderation channel
        await logCompromiseDetection(guild, user, userActivity, punishmentId, dmSent);
        
        // Delete the triggering message if possible
        try {
            await message.delete();
        } catch (deleteError) {
            console.error('[COMPROMISE_DETECTION] Could not delete triggering message:', deleteError);
        }
        
        return kickSuccessful;
        
    } catch (error) {
        console.error('[COMPROMISE_DETECTION] Error handling compromised account:', error);
        return false;
    }
}

/**
 * Log compromise detection to moderation channel
 * @param {Guild} guild - Discord guild
 * @param {User} user - The kicked user
 * @param {Object} userActivity - User's tracked activity
 * @param {string} punishmentId - Punishment ID
 * @param {boolean} dmSent - Whether DM was sent successfully
 */
async function logCompromiseDetection(guild, user, userActivity, punishmentId, dmSent) {
    try {
        const logChannelId = channelConfig.getId('MODERATION_LOG');
        const logChannel = guild.channels.cache.get(logChannelId);
        
        if (!logChannel) return;
        
        // Get channel names for the log
        const channelNames = Array.from(userActivity.channels).map(channelId => {
            const channel = guild.channels.cache.get(channelId);
            return channel ? `#${channel.name}` : `<#${channelId}>`;
        }).join(', ');
        
        // Create detailed embed
        const userMention = await createSmartUserMention(user.id, guild.client, guild, { showRawId: true });
        const embed = new EmbedBuilder()
            .setColor(0xFF4444) // Bright red for security threat
            .setDescription('### **🚨 AUTOMOD - Compromised Account Detected**')
            .setFooter({ text: `Punishment ID: ${punishmentId}` })
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '👤 User', value: `${userMention} (${user.tag})\nID: ${user.id}`, inline: false },
                { name: '🔗 Detection Details', value: `Links sent across **${userActivity.channels.size}** channels\nMessages tracked: **${userActivity.messages.length}**`, inline: true },
                { name: '📍 Affected Channels', value: channelNames, inline: true },
                { name: '⚡ Action Taken', value: '**Kicked** from server', inline: true },
                { name: '💬 User Notified', value: dmSent ? '✅ Yes' : '❌ No (DMs disabled/blocked)', inline: true },
                { name: '🤖 Moderator', value: 'Tranium Bot (Automod)', inline: true },
                { name: '⏰ Detection Time', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
            )
            .setTimestamp();
        
        // Add recent message snippets
        const messageLog = userActivity.messages.map((msg, index) => {
            const channel = guild.channels.cache.get(msg.channelId);
            const channelName = channel ? `#${channel.name}` : 'unknown-channel';
            return `${index + 1}. **${channelName}**: ${msg.content}...`;
        }).join('\n');
        
        if (messageLog) {
            embed.addFields({ name: '📝 Recent Messages', value: messageLog.substring(0, 1024), inline: false });
        }
        
        await logChannel.send({ embeds: [embed] });
        
    } catch (error) {
        console.error('[COMPROMISE_DETECTION] Error logging to moderation channel:', error);
    }
}

/**
 * Check if message contains links
 * @param {string} content - Message content
 * @returns {boolean}
 */
function containsLinks(content) {
    // Simple URL detection regex
    const urlRegex = /https?:\/\/[^\s]+/gi;
    return urlRegex.test(content);
}

/**
 * Check if all links in message are whitelisted
 * @param {string} content - Message content
 * @returns {boolean}
 */
function areAllLinksWhitelisted(content) {
    const urlRegex = /https?:\/\/([^\/\s]+)/gi;
    const matches = [...content.matchAll(urlRegex)];
    
    if (matches.length === 0) return true;
    
    return matches.every(match => {
        const domain = match[1].toLowerCase();
        return DETECTION_CONFIG.whitelistedDomains.some(whitelist => 
            domain.includes(whitelist.toLowerCase())
        );
    });
}

/**
 * Check if user is staff and should be exempt from detection
 * @param {GuildMember} member - Guild member
 * @returns {boolean}
 */
function isStaffExempt(member) {
    if (!member) return false;
    return roleConfig.memberHasRole(member, 'STAFF');
}

/**
 * Clean up old user activity data (call periodically)
 */
function cleanupOldActivity() {
    const now = Date.now();
    const cutoff = now - (DETECTION_CONFIG.timeWindow * 2); // Keep data for 2x the time window
    
    for (const [userId, activity] of userLinkActivity.entries()) {
        if (activity.firstDetection < cutoff) {
            userLinkActivity.delete(userId);
        }
    }
    
    console.log(`[COMPROMISE_DETECTION] Cleaned up old activity data. Active tracking: ${userLinkActivity.size} users`);
}

// Clean up every 10 minutes
setInterval(cleanupOldActivity, 10 * 60 * 1000);

/**
 * Update detection configuration
 * @param {Object} newConfig - New configuration values
 */
function updateConfig(newConfig) {
    if (newConfig.channelThreshold !== undefined) {
        DETECTION_CONFIG.channelThreshold = newConfig.channelThreshold;
    }
    if (newConfig.timeWindow !== undefined) {
        // Convert minutes to milliseconds
        DETECTION_CONFIG.timeWindow = newConfig.timeWindow * 60 * 1000;
    }
    if (newConfig.enabled !== undefined) {
        DETECTION_CONFIG.enabled = newConfig.enabled;
    }
    
    console.log(`[COMPROMISE_DETECTION] Configuration updated:`, DETECTION_CONFIG);
}

/**
 * Get current configuration
 * @returns {Object} Current configuration
 */
function getConfig() {
    return {
        channelThreshold: DETECTION_CONFIG.channelThreshold,
        timeWindow: Math.floor(DETECTION_CONFIG.timeWindow / (60 * 1000)), // Convert back to minutes
        enabled: DETECTION_CONFIG.enabled,
        whitelistedDomains: [...DETECTION_CONFIG.whitelistedDomains]
    };
}

/**
 * Get detection statistics
 * @returns {Object} Detection statistics
 */
function getStats() {
    const today = new Date().toDateString();
    const todayDetections = detectionStats.detectionsByDate.get(today) || 0;
    
    return {
        totalDetections: detectionStats.totalDetections,
        usersKicked: detectionStats.usersKicked,
        lastDetection: detectionStats.lastDetection,
        todayDetections,
        activeTracking: userLinkActivity.size
    };
}

module.exports = {
    checkForCompromisedAccount,
    cleanupOldActivity,
    updateConfig,
    getConfig,
    getStats
}; 