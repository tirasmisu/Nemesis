const { Events, EmbedBuilder } = require('discord.js');
const { getHierarchyLevel } = require('../utils/permissionManager');
const blacklistHelper = require('../utils/blacklistHelper');
const messageFilters = require('../utils/messageFilters');
const channelConfig = require('../config/channels');
const { createSmartUserMention } = require('../utils/utils');

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        // Ignore bot messages, messages without content, and DM messages
        if (oldMessage.author?.bot || !newMessage.content || !oldMessage.guild || !newMessage.guild) return;

        // Additional safety checks for guild access
        if (!oldMessage.guild || !newMessage.guild) {
            console.warn('[MessageUpdate] Guild is null, skipping message update processing');
            return;
        }

        // Ensure we have valid guild channels
        if (!oldMessage.guild.channels || !newMessage.guild.channels) {
            console.warn('[MessageUpdate] Guild channels not available, skipping message update processing');
            return;
        }

        // Get user's hierarchy level
        const member = newMessage.member;
        const userLevel = member ? getHierarchyLevel(member) : 0;

        // Determine if this is a staff member and choose appropriate log channel
        let messageLogId, messageLogChannel;
        try {
            // Check if the message author has the staff role
            const roleConfig = require('../config/roles');
            const isStaff = member && member.roles.cache.has(roleConfig.getId('STAFF'));
            
            if (isStaff) {
                // Staff message edits go to STAFF_LOGS
                messageLogId = channelConfig.getId('STAFF_LOGS');
                messageLogChannel = messageLogId ? oldMessage.guild.channels.cache.get(messageLogId) : null;
            } else {
                // Regular user message edits go to MESSAGE_LOG (but only if not staff)
                if (userLevel >= 1) return; // Skip logging for staff members that somehow don't have the staff role
                messageLogId = channelConfig.getId('MESSAGE_LOG');
                messageLogChannel = messageLogId ? oldMessage.guild.channels.cache.get(messageLogId) : null;
            }
        } catch (error) {
            console.error('[MessageUpdate] Error accessing channel config:', error);
            return;
        }
        
        if (!messageLogChannel) {
            console.warn('[MessageUpdate] Message log channel not found, skipping logging');
            return;
        }

        // Log the message edit
        const authorMention = await createSmartUserMention(oldMessage.author.id, oldMessage.client, oldMessage.guild, { showRawId: true });
        const editEmbed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setDescription(`### **Message Edited**`)
            .setThumbnail(oldMessage.author.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: "Channel", value: `${oldMessage.channel}`, inline: true },
                { name: "Author", value: authorMention, inline: true },
                { name: "Old Content", value: oldMessage.content || "*No content*", inline: false },
                { name: "New Content", value: newMessage.content || "*No content*", inline: false }
            )
            .setFooter({ text: `ID: ${oldMessage.author.id}` })
            .setTimestamp();

        await messageLogChannel.send({ embeds: [editEmbed] });

        // Check for blacklisted words
        let blacklist = [];
        let containsBlacklisted = false;
        try {
            blacklist = blacklistHelper.getBlacklist();
            containsBlacklisted = blacklist.some(word => newMessage.content.toLowerCase().includes(word));
        } catch (error) {
            console.error('[MessageUpdate] Error checking blacklisted words:', error);
        }

        // Check for links in media channels
        let memesId, mediaId, artworkId;
        try {
            memesId = channelConfig.getId('MEMES');
            mediaId = channelConfig.getId('MEDIA');
            artworkId = channelConfig.getId('ARTWORK');
        } catch (error) {
            console.error('[MessageUpdate] Error accessing channel config for media channels:', error);
            memesId = mediaId = artworkId = null;
        }
        
        const isMediaChannel = [memesId, mediaId, artworkId].filter(id => id).includes(newMessage.channel.id);
        
        let containsLinks = false;
        try {
            containsLinks = messageFilters.containsLink(newMessage.content);
        } catch (error) {
            console.error('[MessageUpdate] Error checking for links:', error);
        }

        if (containsBlacklisted || (isMediaChannel && containsLinks)) {
            try {
                await newMessage.delete();
                const deletionAuthorMention = await createSmartUserMention(newMessage.author.id, newMessage.client, newMessage.guild, { showRawId: true });
                const deletionEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle("Message Deleted")
                    .setDescription("An edited message was deleted due to rule violation.")
                    .addFields(
                        { name: "Author", value: deletionAuthorMention, inline: true },
                        { name: "Channel", value: `<#${newMessage.channel.id}>`, inline: true },
                        { name: "Content", value: newMessage.content || "No content", inline: false },
                        { name: "Reason", value: containsBlacklisted ? "Blacklisted words" : "Links in media channel", inline: true }
                    )
                    .setTimestamp();
                await messageLogChannel.send({ embeds: [deletionEmbed] });
            } catch (err) {
                console.error("Failed to delete edited message:", err);
            }
        }
    }
};
