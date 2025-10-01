const { Events, EmbedBuilder } = require('discord.js');
const { createSmartUserMention } = require('../utils/utils');
const channelConfig = require('../config/channels');
const roleConfig = require('../config/roles');

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user) {
        try {
            // Ignore bot reactions
            if (user.bot) return;

            // Fetch the full reaction if it's partial
            if (reaction.partial) {
                await reaction.fetch();
            }

            // Get the message
            const message = reaction.message;

            // Truncate content for embed field
            let content = message.content || 'No content';
            if (content.length > 1000) content = content.slice(0, 1000) + '... (truncated)';

            // Determine if this is a staff member and choose appropriate log channel
            const member = message.guild.members.cache.get(user.id);
            const isStaff = member && member.roles.cache.has(roleConfig.getId('STAFF'));
            
            let logChannelId;
            if (isStaff) {
                // Staff reactions go to STAFF_LOGS
                logChannelId = channelConfig.getId('STAFF_LOGS');
            } else {
                // Regular user reactions go to MESSAGE_LOG (or you could create a separate REACTION_LOG)
                logChannelId = channelConfig.getId('MESSAGE_LOG');
            }
            
            const reactionsLogChannel = message.guild.channels.cache.get(logChannelId);
            if (!reactionsLogChannel) return;

            // Create the embed
            const userMention = await createSmartUserMention(user.id, reaction.message.client, reaction.message.guild, { showRawId: true });
            const messageAuthorMention = await createSmartUserMention(message.author.id, reaction.message.client, reaction.message.guild, { showRawId: true });
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setDescription(`### **Reaction Added**`)
                .addFields(
                    { name: "User", value: userMention, inline: true },
                    { name: "Reaction", value: reaction.emoji.toString(), inline: true },
                    { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
                    { name: "Message Author", value: messageAuthorMention, inline: true },
                    { name: "Message Content", value: content, inline: false }
                )
                .setTimestamp();

            // Add message link if available
            if (message.url) {
                embed.addFields({ name: "Message Link", value: `[Jump to Message](${message.url})`, inline: false });
            }

            // Add message image if available
            if (message.attachments.size > 0) {
                const image = message.attachments.first();
                if (image.contentType?.startsWith('image/')) {
                    embed.setImage(image.url);
                }
            }

            // Send the log
            await reactionsLogChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error handling reaction add:', error);
        }
    },
}; 
