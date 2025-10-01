const fs = require("node:fs/promises");
const { EmbedBuilder } = require("discord.js");

// Helper Function to Remove Role
async function removeRole({ guildId, userId, roleId, punishmentId, reason }, logChannel, moderator, client) {
    try {
        // Validate that `client` is passed correctly
        if (!client || !client.guilds) {
            throw new Error("Client object is not defined or invalid");
        }

        // Fetch the guild
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            console.error(`[RemoveRole] Guild with ID ${guildId} not found.`);
            return;
        }

        // Fetch the guild member
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
            console.log(`[RemoveRole] Member with ID ${userId} not found in guild ${guildId}. They might have left the server. Punishment remains active in database.`);
            
            // Mark punishment as inactive in database (time expired, even if user left)
            try {
                const ModerationAction = require('../models/ModerationAction');
                await ModerationAction.findOneAndUpdate(
                    { userId: userId, actionId: punishmentId, active: true },
                    { active: false }
                );
                console.log(`[RemoveRole] Marked punishment ${punishmentId} as inactive (expired)`);
            } catch (error) {
                console.error(`[RemoveRole] Error updating punishment status:`, error);
            }
            return;
        }

        // Fetch the role (ensure the role exists)
        let role = guild.roles.cache.get(roleId);
        if (!role) {
            console.warn(`[RemoveRole] Role with ID ${roleId} was not found in guild ${guildId}. Attempting to refresh roles.`);
            await guild.roles.fetch().catch(() => null);
            role = guild.roles.cache.get(roleId);
            if (!role) {
                console.error(`[RemoveRole] Role with ID ${roleId} does not exist in guild ${guildId} after fetching.`);
                return;
            }
        }

        // Remove the role
        await member.roles.remove(role);

        // Mark punishment as inactive in database
        try {
            const ModerationAction = require('../models/ModerationAction');
            await ModerationAction.findOneAndUpdate(
                { userId: userId, actionId: punishmentId, active: true },
                { active: false }
            );
            console.log(`[RemoveRole] Marked punishment ${punishmentId} as inactive (expired)`);
        } catch (error) {
            console.error(`[RemoveRole] Error updating punishment status:`, error);
        }

        // Notify the member (optional)
        try {
            await member.send(`Your **${role.name}** role in **${guild.name}** has been removed automatically.`);
        } catch {
            console.warn(`[RemoveRole] Could not notify ${member.user.tag} about role removal.`);
        }

        // Log to the moderation channel (optional)
        if (logChannel) {
            const embed = new EmbedBuilder()
                .setColor(0xff0000) // Red color for role removal
                .setDescription("### **Moderation Log**")
                .setFooter({ text: `Punishment ID: ${punishmentId}` })
                .addFields(
                    { name: "🔴 Role Removed", value: `**User:** <@${member.id}> (${member.user.tag})`, inline: true },
                    { name: "Role", value: `${role.name}`, inline: true },
                    { name: "Reason", value: reason || "No reason provided.", inline: true },
                    { name: "Removed By", value: `<@${moderator.id}>`, inline: true }
                );
            await logChannel.send({ embeds: [embed] });
        }

        console.log(`[RemoveRole] Successfully removed role '${role.name}' from ${member.user.tag}.`);
    } catch (error) {
        console.error(`[RemoveRole] Failed to remove role:`, error);
    }
}

module.exports = removeRole;
