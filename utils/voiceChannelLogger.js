const { EmbedBuilder } = require('discord.js');
const channelConfig = require('../config/channels');
const roleConfig = require('../config/roles');

/**
 * Log voice channel activity to the VC_LOG channel
 * @param {Object} guild - Discord guild object
 * @param {Object} member - Discord member object
 * @param {string} action - Action type: 'join', 'leave', 'move'
 * @param {Object} oldChannel - Previous voice channel (for moves/leaves)
 * @param {Object} newChannel - New voice channel (for joins/moves)
 */
async function logVoiceActivity(guild, member, action, oldChannel = null, newChannel = null) {
    try {
        const vcLogChannelId = channelConfig.getId('VC_LOG');
        const vcLogChannel = guild.channels.cache.get(vcLogChannelId);
        
        if (!vcLogChannel) {
            console.warn('[VoiceLogger] VC_LOG channel not found or not accessible');
            return;
        }

        let embed;
        const timestamp = new Date();

        switch (action) {
            case 'join':
                embed = new EmbedBuilder()
                    .setColor(0x00FF00) // Green for join
                    .setTitle('📞 Voice Channel Join')
                    .setDescription(`**${member.user.tag}** joined **${newChannel.name}**`)
                    .addFields(
                        { name: 'User', value: `<@${member.id}>`, inline: true },
                        { name: 'Channel', value: `<#${newChannel.id}>`, inline: true },
                        { name: 'Members in VC', value: `${newChannel.members.size}`, inline: true }
                    )
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                    .setTimestamp(timestamp);
                break;

            case 'leave':
                embed = new EmbedBuilder()
                    .setColor(0xFF0000) // Red for leave
                    .setTitle('📞 Voice Channel Leave')
                    .setDescription(`**${member.user.tag}** left **${oldChannel.name}**`)
                    .addFields(
                        { name: 'User', value: `<@${member.id}>`, inline: true },
                        { name: 'Channel', value: `<#${oldChannel.id}>`, inline: true },
                        { name: 'Members in VC', value: `${oldChannel.members.size}`, inline: true }
                    )
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                    .setTimestamp(timestamp);
                break;

            case 'move':
                embed = new EmbedBuilder()
                    .setColor(0xFFFF00) // Yellow for move
                    .setTitle('📞 Voice Channel Move')
                    .setDescription(`**${member.user.tag}** moved from **${oldChannel.name}** to **${newChannel.name}**`)
                    .addFields(
                        { name: 'User', value: `<@${member.id}>`, inline: true },
                        { name: 'From', value: `<#${oldChannel.id}>`, inline: true },
                        { name: 'To', value: `<#${newChannel.id}>`, inline: true }
                    )
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                    .setTimestamp(timestamp);
                break;

            default:
                console.warn(`[VoiceLogger] Unknown action type: ${action}`);
                return;
        }

        await vcLogChannel.send({ embeds: [embed] });
        console.log(`[VoiceLogger] Logged ${action} for ${member.user.tag}`);

    } catch (error) {
        console.error('[VoiceLogger] Error logging voice activity:', error);
    }
}

/**
 * Add the "In VC" role to a member
 * @param {Object} member - Discord member object
 * @returns {Promise<boolean>} - True if role was added successfully
 */
async function addInVcRole(member) {
    try {
        const inVcRoleId = roleConfig.getId('IN_VC');
        
        if (!inVcRoleId) {
            console.warn('[VoiceLogger] IN_VC role ID not found in configuration');
            return false;
        }

        // Check if member already has the role
        if (member.roles.cache.has(inVcRoleId)) {
            console.log(`[VoiceLogger] ${member.user.tag} already has In VC role`);
            return true;
        }

        await member.roles.add(inVcRoleId, 'User joined voice channel');
        console.log(`[VoiceLogger] Added In VC role to ${member.user.tag}`);
        return true;

    } catch (error) {
        console.error(`[VoiceLogger] Error adding In VC role to ${member.user.tag}:`, error);
        return false;
    }
}

/**
 * Remove the "In VC" role from a member
 * @param {Object} member - Discord member object
 * @returns {Promise<boolean>} - True if role was removed successfully
 */
async function removeInVcRole(member) {
    try {
        const inVcRoleId = roleConfig.getId('IN_VC');
        
        if (!inVcRoleId) {
            console.warn('[VoiceLogger] IN_VC role ID not found in configuration');
            return false;
        }

        // Check if member has the role
        if (!member.roles.cache.has(inVcRoleId)) {
            console.log(`[VoiceLogger] ${member.user.tag} doesn't have In VC role`);
            return true;
        }

        await member.roles.remove(inVcRoleId, 'User left voice channel');
        console.log(`[VoiceLogger] Removed In VC role from ${member.user.tag}`);
        return true;

    } catch (error) {
        console.error(`[VoiceLogger] Error removing In VC role from ${member.user.tag}:`, error);
        return false;
    }
}

/**
 * Check if a member should have the "In VC" role based on their current voice state
 * @param {Object} member - Discord member object
 * @returns {Promise<boolean>} - True if member should have the role
 */
async function shouldHaveInVcRole(member) {
    try {
        // Check if member is currently in a voice channel
        const isInVoice = member.voice.channel !== null;
        
        // Additional checks could be added here:
        // - Exclude AFK channels
        // - Exclude specific channels
        // - Check if user is deafened/muted
        
        return isInVoice;
    } catch (error) {
        console.error(`[VoiceLogger] Error checking if ${member.user.tag} should have In VC role:`, error);
        return false;
    }
}

/**
 * Sync the "In VC" role for a member based on their current voice state
 * @param {Object} member - Discord member object
 * @returns {Promise<boolean>} - True if sync was successful
 */
async function syncInVcRole(member) {
    try {
        const shouldHave = await shouldHaveInVcRole(member);
        const inVcRoleId = roleConfig.getId('IN_VC');
        const hasRole = member.roles.cache.has(inVcRoleId);

        if (shouldHave && !hasRole) {
            return await addInVcRole(member);
        } else if (!shouldHave && hasRole) {
            return await removeInVcRole(member);
        }

        return true; // No change needed
    } catch (error) {
        console.error(`[VoiceLogger] Error syncing In VC role for ${member.user.tag}:`, error);
        return false;
    }
}

/**
 * Sync the "In VC" role for all members in a guild based on their current voice state
 * This is useful for when the bot starts up and needs to sync roles
 * @param {Object} guild - Discord guild object
 * @returns {Promise<Object>} - Result object with sync statistics
 */
async function syncAllInVcRoles(guild) {
    try {
        console.log(`[VoiceLogger] Starting In VC role sync for guild: ${guild.name}`);
        
        const stats = {
            total: 0,
            added: 0,
            removed: 0,
            errors: 0,
            skipped: 0
        };

        // Get all members in the guild
        const members = await guild.members.fetch();
        
        for (const [memberId, member] of members) {
            // Skip bots
            if (member.user.bot) {
                stats.skipped++;
                continue;
            }
            
            stats.total++;
            
            try {
                const shouldHave = await shouldHaveInVcRole(member);
                const inVcRoleId = roleConfig.getId('IN_VC');
                const hasRole = member.roles.cache.has(inVcRoleId);

                if (shouldHave && !hasRole) {
                    const success = await addInVcRole(member);
                    if (success) {
                        stats.added++;
                    } else {
                        stats.errors++;
                    }
                } else if (!shouldHave && hasRole) {
                    const success = await removeInVcRole(member);
                    if (success) {
                        stats.removed++;
                    } else {
                        stats.errors++;
                    }
                }
            } catch (error) {
                console.error(`[VoiceLogger] Error syncing In VC role for ${member.user.tag}:`, error);
                stats.errors++;
            }
        }

        console.log(`[VoiceLogger] In VC role sync complete for ${guild.name}:`, stats);
        return stats;

    } catch (error) {
        console.error('[VoiceLogger] Error during In VC role sync:', error);
        return { error: error.message };
    }
}

module.exports = {
    logVoiceActivity,
    addInVcRole,
    removeInVcRole,
    shouldHaveInVcRole,
    syncInVcRole,
    syncAllInVcRoles
}; 