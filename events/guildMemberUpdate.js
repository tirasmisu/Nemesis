const { Events, EmbedBuilder, ChannelType } = require('discord.js');
const channelConfig = require('../config/channels');

// Helper function to check if bot can modify a user's nickname
function canBotManageUser(guild, member) {
    try {
        const botMember = guild.members.me;
        if (!botMember) return false;
        
        // If bot has admin permission, it can manage anyone except the server owner
        if (botMember.permissions.has('Administrator')) {
            return member.id !== guild.ownerId;
        }
        
        // Compare highest role positions
        const botHighestRole = botMember.roles.highest;
        const userHighestRole = member.roles.highest;
        
        // Bot can only manage users with lower role position
        return botHighestRole.position > userHighestRole.position && member.id !== guild.ownerId;
    } catch (error) {
        console.error('[HIERARCHY_CHECK] Error checking hierarchy:', error);
        return false;
    }
}

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember) {
        const guild = newMember.guild;

        // Get the member log channel from central config
        const memberLogId = channelConfig.getId('MEMBER_LOG');
        const logChannel = guild.channels.cache.get(memberLogId);
        if (!logChannel) {
            console.error('Member log channel not found.');
            return;
        }

        // --------------------------------------------------------------------
        // DIRECT OUT OF OFFICE ROLE HANDLER - RUNS FIRST
        // --------------------------------------------------------------------
        try {
            // Get the roles we care about using role config
            const roleConfig = require('../config/roles');
            const outOfOfficeRole = guild.roles.cache.get(roleConfig.getId('OUT_OF_OFFICE'));
            const staffRole = guild.roles.cache.get(roleConfig.getId('STAFF'));
            
            if (!outOfOfficeRole) {
                console.error(`[OOO-DIRECT] Out of Office role not found`);
            } else if (!staffRole) {
                console.error('[OOO-DIRECT] STAFF role not found in the server!');
            } else {
                // Check if user has both roles
                const hasOOO = newMember.roles.cache.has(outOfOfficeRole.id);
                const isStaff = newMember.roles.cache.has(staffRole.id);
                
                // Get current nickname or username as base
                const currentNickname = newMember.nickname;
                const username = newMember.user.username;
                const baseDisplayName = currentNickname || username;
                
                // Check if user has recent activity or pending nickname request to avoid interfering
                const { shouldSkipOOOProcessing } = require('../utils/nicknameHelper');
                const shouldSkip = await shouldSkipOOOProcessing(newMember.user.id, guild);
                
                if (shouldSkip) {
                    console.log(`[OOO-DIRECT] ⏭️ Skipping ${newMember.user.tag} - recent nickname request activity or pending request`);
                    return;
                }
                
                if (hasOOO && isStaff) {
                    // Should have (OOO) tag
                    if (!baseDisplayName.endsWith('(OOO)')) {
                        // Check if bot can manage this user before attempting
                        if (!canBotManageUser(guild, newMember)) {
                            console.log(`[OOO-DIRECT] ⏭️ Skipping ${newMember.user.tag} - insufficient permissions (higher role)`);
                        } else {
                            try {
                                const newNickname = `${baseDisplayName} (OOO)`;
                                await guild.members.edit(newMember.id, {
                                    nick: newNickname
                                });
                                console.log(`[OOO-DIRECT] ✅ Added (OOO) tag to ${newMember.user.tag}: "${newNickname}"`);
                            } catch (err) {
                                console.error(`[OOO-DIRECT] ❌ Error adding (OOO) tag:`, err.message);
                            }
                        }
                    }
                } else if (baseDisplayName.endsWith('(OOO)')) {
                    // Should NOT have (OOO) tag
                    // Check if bot can manage this user before attempting
                    if (!canBotManageUser(guild, newMember)) {
                        console.log(`[OOO-DIRECT] ⏭️ Skipping ${newMember.user.tag} - insufficient permissions (higher role)`);
                    } else {
                        try {
                            let newNickname = baseDisplayName.replace(/ \(OOO\)$/, '');
                            // If the result would be their username, clear the nickname instead
                            const finalNickname = newNickname === username ? null : newNickname;
                            await guild.members.edit(newMember.id, {
                                nick: finalNickname
                            });
                            console.log(`[OOO-DIRECT] ✅ Removed (OOO) tag from ${newMember.user.tag}: "${finalNickname || 'cleared'}"`);
                        } catch (err) {
                            console.error(`[OOO-DIRECT] ❌ Error removing (OOO) tag:`, err.message);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`[OOO-DIRECT] 🔴 Critical error in OOO handler:`, error);
        }

        // Create an embed for member changes
        const createEmbed = (userTag, action, details, userId, avatarURL, color) => {
            const embed = new EmbedBuilder()
                .setColor(color) // Set color based on action
                .setDescription(`### **Member Log**`)
                .setFooter({ text: `ID: ${userId}` })
                .setThumbnail(avatarURL) // Add the user's profile picture
                .addFields({
                    name: `${action}`,
                    value: details,
                    inline: false,
                });
            return embed;
        };

        // Handle nickname changes (blue color)
        if (oldMember.nickname !== newMember.nickname) {
            const oldNickname = oldMember.nickname || oldMember.user.username;
            const newNickname = newMember.nickname || newMember.user.username;
            const avatarURL = newMember.user.displayAvatarURL({ dynamic: true });

            const embed = createEmbed(
                newMember.user.tag,
                "🔵 Nickname Change",
                `**Old Nickname:** ${oldNickname}\n**New Nickname:** ${newNickname}`,
                newMember.user.id,
                avatarURL,
                0x3498DB // Blue color for nickname changes
            );
            await logChannel.send({ embeds: [embed] });
        }

        // Handle role changes
        const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
        const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

        for (const role of addedRoles.values()) {
            const avatarURL = newMember.user.displayAvatarURL({ dynamic: true });
            const embed = createEmbed(
                newMember.user.tag,
                "🟡 Given Role",
                `**Role:** ${role.name}`,
                newMember.user.id,
                avatarURL,
                0xF1C40F // Yellow color for given roles
            );
            await logChannel.send({ embeds: [embed] });
        }

        for (const role of removedRoles.values()) {
            const avatarURL = newMember.user.displayAvatarURL({ dynamic: true });
            const embed = createEmbed(
                newMember.user.tag,
                "🟡 Removed Role",
                `**Role:** ${role.name}`,
                newMember.user.id,
                avatarURL,
                0xE67E22 // Orange color for removed roles
            );
            await logChannel.send({ embeds: [embed] });
        }

        // Handle avatar changes (blue color)
        if (oldMember.user.avatar !== newMember.user.avatar) {
            const oldAvatarURL = oldMember.user.displayAvatarURL({ dynamic: true });
            const newAvatarURL = newMember.user.displayAvatarURL({ dynamic: true });

            const embed = createEmbed(
                newMember.user.tag,
                "🔵 Avatar Change",
                `[Old Avatar](${oldAvatarURL}) → [New Avatar](${newAvatarURL})`,
                newMember.user.id,
                newAvatarURL,
                0x3498DB // Blue color for avatar changes
            );
            await logChannel.send({ embeds: [embed] });
        }
    },
};
