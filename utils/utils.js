const { ChannelType, EmbedBuilder } = require('discord.js'); // Ensure you import required enums and EmbedBuilder
const channelConfig = require('../config/channels');

/**
 * Create a smart user mention that handles cases where users can't be resolved
 * @param {string} userId - The Discord user ID
 * @param {Object} client - The Discord client instance
 * @param {Object} guild - The Discord guild instance (optional)
 * @param {Object} options - Additional options
 * @returns {Promise<string>} - A formatted user mention or fallback
 */
async function createSmartUserMention(userId, client, guild = null, options = {}) {
    if (!userId || !client) return '`Unknown User`';
    
    try {
        // Try to fetch the user from cache first, then from API
        let user = client.users.cache.get(userId);
        if (!user) {
            user = await client.users.fetch(userId);
        }
        
        // If we have a guild, check if they're still a member
        let isMember = false;
        if (guild && user) {
            try {
                const member = await guild.members.fetch(userId);
                isMember = !!member;
            } catch {
                isMember = false;
            }
        }
        
        // Create the mention with appropriate indicators
        if (user) {
            const mention = `<@${userId}>`;
            if (guild && !isMember && options.showMemberStatus) {
                return `${mention} *(left server)*`;
            }
            return mention;
        }
    } catch (error) {
        // User not found or other error
        console.log(`[SmartMention] Could not resolve user ${userId}:`, error.message);
    }
    
    // Fallback when user can't be resolved
    if (options.showRawId) {
        return `\`Unknown User (${userId})\``;
    }
    return '`Unknown User`';
}

/**
 * Get options from the interaction object
 * @param {CommandInteraction} interaction
 * @returns {Object} - Object containing user, reason, and moderator
 */
function getInteractionOptions(interaction) {
    const user = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason specified';
    const moderator = interaction.user;

    return { user, reason, moderator };
}

/**
 * Find the moderation log channel in the guild using central config
 * @param {Guild} guild - The Discord Guild
 * @returns {TextChannel|null}
 */
function getModerationLogChannel(guild) {
    const channelId = channelConfig.getId('MODERATION_LOG');
    return guild.channels.cache.get(channelId) || null;
}

/**
 * Standardized function to notify users via DM about moderation actions
 * @param {Object} user - The Discord user object to notify
 * @param {Object} guild - The Discord guild object where the action occurred
 * @param {string} action - The action taken (ban, mute, warn, etc.)
 * @param {string|null} duration - Duration of the action (for temporary actions)
 * @param {string} reason - Reason for the action
 * @param {Object} options - Additional options
 * @returns {Promise<boolean>} Whether the notification was successful
 */
async function notifyUser(user, guild, action, duration, reason, options = {}) {
    if (!user || !guild) return false;
    
    try {
        let message = `You have been ${action} in **${guild.name}**`;
        
        if (duration) {
            message += ` for **${duration}**`;
        }
        
        if (reason) {
            message += ` due to: **${reason}**`;
        }
        
        if (options.additionalInfo) {
            message += `\n\n${options.additionalInfo}`;
        }
        
        // Add ban appeal server link for bans
        if (action === 'banned') {
            message += `\n\nIf you would like to appeal this ban, you can join our appeal server: https://discord.gg/traniumappeal`;
        } else if (options.appealInfo) {
            message += `\n\nIf you believe this action was taken in error, ${options.appealInfo}`;
        }
        
        await user.send(message);
        return true;
    } catch (error) {
        // Silently fail if DMs are disabled - don't log error to console
        // The calling function will handle the false return value appropriately
        return false;
    }
}

/**
 * Create a standardized embed for moderation actions
 * @param {Object} options - Embed options
 * @returns {Object} Discord embed object
 */
function createStandardEmbed(options) {
    const { 
        color = 0x5865F2, // Discord blue as default
        title,
        description,
        fields = [],
        footer,
        timestamp = true,
        thumbnail
    } = options;
    
    const embed = new EmbedBuilder()
        .setColor(color)
        .setDescription(description || '');
    
    if (title) embed.setTitle(title);
    if (fields.length > 0) embed.addFields(fields);
    if (footer) embed.setFooter(footer);
    if (timestamp) embed.setTimestamp();
    if (thumbnail) embed.setThumbnail(thumbnail);
    
    return embed;
}

// Correctly export the functions
module.exports = {
    createSmartUserMention,
    getInteractionOptions,
    getModerationLogChannel,
    notifyUser,
    createStandardEmbed
};
