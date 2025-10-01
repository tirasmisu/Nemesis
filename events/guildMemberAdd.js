const { Events, EmbedBuilder } = require('discord.js');
const channelConfig = require('../config/channels');
const roleConfig = require('../config/roles');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        // Get channels using the central config
        const memberLogId = channelConfig.getId('MEMBER_LOG');
        const doorLogId = channelConfig.getId('DOOR_LOG');
        
        const memberLogChannel = member.guild.channels.cache.get(memberLogId);
        const doorLogChannel = member.guild.channels.cache.get(doorLogId);
        const subscribersRole = member.guild.roles.cache.find(role => role.name === 'Subscribers');

        if (subscribersRole) {
            try {
                await member.roles.add(subscribersRole);
                //console.log(`Assigned Subscribers role to ${member.user.tag}`);
            } catch (error) {
                console.error(`Failed to assign Subscribers role to ${member.user.tag}:`, error);
            }
        } else {
            console.error("Subscribers role not found.");
        }

        // Check for active punishments and reapply roles
        await checkAndReapplyActivePunishments(member);

        // Create an embed for member joining
        const embed = new EmbedBuilder()
            .setColor(0x00FF00) // Green color for joining
            .setDescription(`### **Member Log**`)
            .setFooter({ text: `ID: ${member.user.id}` })
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .addFields({
                name: "🟢 Member Joined",
                value: `<@${member.user.id}> has joined the server.`,
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

// Function to check and reapply active punishments when user rejoins
async function checkAndReapplyActivePunishments(member) {
    try {
        const ModerationAction = require('../models/ModerationAction');
        const ms = require('ms');
        
        // Find all active punishments for this user
        const activePunishments = await ModerationAction.find({
            userId: member.id,
            active: true
        });
        
        console.log(`[GuildMemberAdd] Found ${activePunishments.length} active punishments for ${member.user.tag}`);
        
        for (const punishment of activePunishments) {
            const { action, duration, timestamp, actionId } = punishment;
            
            // Check if punishment has expired
            if (duration && duration !== 'permanent' && duration !== 'forever') {
                const durationMs = ms(duration);
                if (durationMs) {
                    const endTime = new Date(timestamp).getTime() + durationMs;
                    const now = Date.now();
                    
                    if (now >= endTime) {
                        // Punishment expired, mark as inactive
                        await ModerationAction.findOneAndUpdate(
                            { actionId: actionId },
                            { active: false }
                        );
                        console.log(`[GuildMemberAdd] Expired punishment ${actionId} marked as inactive`);
                        continue;
                    }
                }
            }
            
            // Reapply active punishment
            if (action === 'mute') {
                const muteRoleId = roleConfig.getId('MUTED');
                const muteRole = member.guild.roles.cache.get(muteRoleId);
                
                if (muteRole) {
                    await member.roles.add(muteRole);
                    console.log(`[GuildMemberAdd] Reapplied mute role to ${member.user.tag} (punishment: ${actionId})`);
                } else {
                    console.error(`[GuildMemberAdd] Mute role not found for punishment ${actionId}`);
                }
            } else if (action === 'role_add') {
                // Handle timed roles - get roleId from metadata
                const roleId = punishment.metadata?.roleId;
                if (roleId) {
                    const role = member.guild.roles.cache.get(roleId);
                    if (role) {
                        await member.roles.add(role);
                        console.log(`[GuildMemberAdd] Reapplied role ${role.name} to ${member.user.tag} (punishment: ${actionId})`);
                    } else {
                        console.error(`[GuildMemberAdd] Role ${roleId} not found for punishment ${actionId}`);
                    }
                } else {
                    console.log(`[GuildMemberAdd] No roleId stored in metadata for punishment ${actionId}`);
                }
            }
        }
    } catch (error) {
        console.error(`[GuildMemberAdd] Error checking active punishments for ${member.user.tag}:`, error);
    }
}
