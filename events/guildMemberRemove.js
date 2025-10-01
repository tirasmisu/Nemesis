const { Events, EmbedBuilder } = require('discord.js');
const channelConfig = require('../config/channels');
const { createSmartUserMention } = require('../utils/utils');

module.exports = {
    name: Events.GuildMemberRemove,
    async execute(member) {
        // Get channels using the central config
        const memberLogId = channelConfig.getId('MEMBER_LOG');
        const doorLogId = channelConfig.getId('DOOR_LOG');
        
        const memberLogChannel = member.guild.channels.cache.get(memberLogId);
        const doorLogChannel = member.guild.channels.cache.get(doorLogId);

        // Create an embed for member leaving
        const userMention = await createSmartUserMention(member.user.id, member.client, member.guild);
        const embed = new EmbedBuilder()
            .setColor(0xFF0000) // Red color for leaving
            .setDescription(`### **Member Log**`)
            .setFooter({ text: `ID: ${member.user.id}` })
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .addFields({
                name: "🔴 Member Left",
                value: `${userMention} has left the server.`,
                inline: false,
            });

        // Send the embed to the member log channel
        if (memberLogChannel) {
            await memberLogChannel.send({ embeds: [embed] });
        } else {
            console.error("Member log channel not found.");
        }

        // Send the embed to the door log channel
        if (doorLogChannel) {
            await doorLogChannel.send({ embeds: [embed] });
        } else {
            console.error("Door log channel not found.");
        }
    },
};
