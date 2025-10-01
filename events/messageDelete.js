const { Events, EmbedBuilder } = require('discord.js');
const channelConfig = require('../config/channels');
const { createSmartUserMention } = require('../utils/utils');
const roleConfig = require('../config/roles');

module.exports = {
    name: Events.MessageDelete,
    async execute(message) {
        // Skip if message doesn't have an author (partial message) or if it's from a bot
        if (!message.author || message.author.bot) return;
        
        // Skip if message is not from a guild (DMs, etc.)
        if (!message.guild) return;

        // Determine if this is a staff member and choose appropriate log channel
        let logChannelId;
        let logChannel;
        
        // Check if the message author has the staff role
        const member = message.member;
        const isStaff = member && member.roles.cache.has(roleConfig.getId('STAFF'));
        
        if (isStaff) {
            // Staff message deletions go to STAFF_LOGS
            logChannelId = channelConfig.getId('STAFF_LOGS');
            logChannel = message.guild.channels.cache.get(logChannelId);
        } else {
            // Regular user message deletions go to MESSAGE_LOG
            logChannelId = channelConfig.getId('MESSAGE_LOG');
            logChannel = message.guild.channels.cache.get(logChannelId);
        }
        
        if (!logChannel) {
            console.error(`${isStaff ? 'Staff logs' : 'Message log'} channel not found.`);
            return;
        }

        // Create an embed to log the deleted message
        const userMention = await createSmartUserMention(message.author.id, message.client, message.guild, { showRawId: true });
        const embed = new EmbedBuilder()
            .setColor(0xFF0000) // Red color for message deletion
            .setDescription(`### **Message Deleted**`)
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: "User", value: `${userMention} (${message.author.tag})\nUser ID: ${message.author.id}`, inline: false },
                { name: "Channel", value: `<#${message.channel.id}>`, inline: true }
            )
            .setTimestamp();

        // Handle content - check for attachments first
        if (message.attachments && message.attachments.size > 0) {
            let attachmentInfo = "";
            message.attachments.forEach((attachment) => {
                const fileType = attachment.contentType || "unknown type";
                attachmentInfo += `• ${attachment.name || "Unnamed file"} (${fileType})\n`;
            });
            
            embed.addFields([{ name: "Attachments", value: attachmentInfo, inline: false }]);
            
            // If there's also text content, add that separately
            if (message.content) {
                embed.addFields([{ name: "Message Content", value: message.content, inline: false }]);
            }
            
            // If it's an image, try to include it in the embed
            const firstAttachment = message.attachments.first();
            if (firstAttachment && firstAttachment.contentType && firstAttachment.contentType.startsWith('image/')) {
                embed.setImage(firstAttachment.url);
            }
        } else {
            // No attachments, just text content (or lack thereof)
            embed.addFields([{ name: "Message Content", value: message.content || "No Content", inline: false }]);
        }

        // Send the embed to the message-log channel
        try {
            await logChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Failed to log deleted message:', error);
        }

        // If the message was deleted from the memes channel, add a skull to the forwarded message
        try {
            const memesId = channelConfig.getId('MEME_SOURCE');
            const mediaId = channelConfig.getId('MEDIA');
            const memeForwardId = channelConfig.getId('MEME_FORWARD');
            
            // Check if this is from a media channel that gets forwarded
            if (message.channel.id === memesId) {
                const forwardChannel = message.guild.channels.cache.get(memeForwardId);
                if (!forwardChannel) {
                    console.error("Meme forward channel not found.");
                    return;
                }

                // Create the message link that would be in the forwarded content
                const messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
                
                // Get recent messages from the meme forward channel
                const recentMessages = await forwardChannel.messages.fetch({ limit: 30 });
                
                // Find messages that contain the deleted message's link
                const linkedMessages = recentMessages.filter(msg => 
                    msg.content.includes(messageLink)
                );
                
                // Add the skull emoji to each one
                if (linkedMessages.size > 0) {
                    console.log(`[MemeDelete] Found ${linkedMessages.size} forwarded messages for deleted message`);
                    
                    for (const [_, forwardedMsg] of linkedMessages) {
                        try {
                            // Add a skull reaction instead of editing the message
                            await forwardedMsg.react('💀');
                            console.log(`[MemeDelete] Added skull reaction to forwarded message ${forwardedMsg.id}`);
                        } catch (reactionError) {
                            console.error('Failed to add skull reaction to forwarded message:', reactionError);
                        }
                    }
                }
            }
        } catch (forwardError) {
            console.error('Error handling meme deletion:', forwardError);
        }
    },
};
