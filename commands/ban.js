const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Command framework
const { ModerationCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorManager');

// Helpers & services
const { checkModerationPermission } = require('../utils/commandHelpers');
const { generateUniquePunishmentId } = require('../utils/generatePunishmentId');
const { saveModerationAction } = require('../services/moderationActionService');
const { notifyUser, createSmartUserMention } = require('../utils/utils');
const ModerationAction = require('../models/ModerationAction');

// Channel configuration
const channelConfig = require('../config/channels');

class BanCommand extends ModerationCommand {
    constructor() {
        super(new SlashCommandBuilder()
            .setName('ban')
            .setDescription('Ban a user from the server')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('The user to ban')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for the ban')
                    .setRequired(true)));
    }

    async validateInput(interaction) {
        // Check permission - allow Mods and above
        if (!await checkModerationPermission(interaction, 'mods')) {
            throw createValidationError('You do not have permission to use this command');
        }

        const target = interaction.options.getUser('user');
        if (!target) {
            throw createValidationError('User option is required');
        }
        
        const reason = interaction.options.getString('reason');

        // Check for active ban
        const activeBan = await this.checkActiveBan(target.id);
        
        // Instead of throwing an error, just return the existing ban info
        // This allows the command to update the ban with a new reason
        return { target, reason, existingBan: activeBan };
    }

    async execute(interaction) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ flags: ['Ephemeral'] });
            }
            const { target, reason, existingBan } = await this.validateInput(interaction);
            let punishmentId;
            if (existingBan) {
                // If user is already banned, use the existing punishment ID
                punishmentId = existingBan.actionId;
                // Update the existing ban record with the new reason
                await ModerationAction.findOneAndUpdate(
                    { userId: target.id, action: 'ban', active: true },
                    { reason, moderatorId: interaction.user.id, timestamp: new Date() }
                );
            } else {
                // Generate a new punishment ID for a new ban
                punishmentId = await generateUniquePunishmentId();
                // Ban the user
                await interaction.guild.members.ban(target, { reason });
                // Save moderation action
                await saveModerationAction({
                    userId: target.id,
                    moderatorId: interaction.user.id,
                    action: 'ban',
                    reason,
                    actionId: punishmentId,
                    timestamp: new Date(),
                    active: true
                });
            }
            const result = {
                target,
                reason,
                punishmentId,
                moderator: interaction.user,
                updated: !!existingBan
            };
            await this.sendResponse(interaction, result);
            await this.logAction(interaction, result);
            await interaction.editReply({ embeds: [await this.createResultEmbed(result, interaction.client, interaction.guild)] });
        } catch (error) {
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ content: 'An error occurred while processing your request.' });
            } else if (!interaction.replied) {
                await interaction.reply({ content: 'An error occurred while processing your request.', flags: ['Ephemeral'] });
            }
        }
    }

    async sendResponse(interaction, result) {
        const { target, reason, updated } = result;
        
        let confirmationMessage;
        
        if (updated) {
            confirmationMessage = `Ban for ${target.tag} has been updated with a new reason.`;
        } else {
            // Try to notify the user using the standardized utility
            const dmSent = await notifyUser(target, interaction.guild, 'banned', null, reason);
            
            confirmationMessage = `Successfully banned ${target.tag}.`;
            if (!dmSent) {
                confirmationMessage += ` ⚠️ Could not notify user (DMs disabled or blocked).`;
            }
        }

        await interaction.followUp({
            content: confirmationMessage,
            flags: ['Ephemeral']
        });
    }

    async logAction(interaction, result) {
        const { target, reason, moderator, punishmentId, updated } = result;

        // Create smart user mentions
        const userMention = await createSmartUserMention(target.id, interaction.client, interaction.guild, { showRawId: true });
        const moderatorMention = await createSmartUserMention(moderator.id, interaction.client, interaction.guild, { showRawId: true });

        // Create moderation embed
        const embed = new EmbedBuilder()
            .setColor(0xFF0000) // Red for ban
            .setDescription(`### **Moderation Log**`)
            .setFooter({ text: `Punishment ID: ${punishmentId}` })
            .setThumbnail(target.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: updated ? "🔨 Ban Updated" : "🔨 Ban", value: `**User:** ${userMention} (${target.tag})`, inline: false },
                { name: "Reason", value: reason, inline: false },
                { name: "Moderator", value: moderatorMention, inline: true }
            )
            .setTimestamp();

        // Get log channel from config and send the embed
        const logChannelId = channelConfig.getId('MODERATION_LOG');
        const logChannel = interaction.guild.channels.cache.get(logChannelId);
        
        if (logChannel) {
            await logChannel.send({ embeds: [embed] });
        }
    }

    shouldLogAction() {
        return true;
    }

    async checkActiveBan(userId) {
        return await ModerationAction.findOne({
            userId,
            action: 'ban',
            active: true
        });
    }

    async createResultEmbed(result, client, guild) {
        const { target, reason, punishmentId, updated } = result;
        
        // Create smart user mention
        const userMention = await createSmartUserMention(target.id, client, guild, { showRawId: true });
        
        const embed = new EmbedBuilder()
            .setColor(updated ? 0x00FF00 : 0xFF0000) // Green for update, red for ban
            .setDescription(`### **Moderation Result**`)
            .setFooter({ text: `Punishment ID: ${punishmentId}` })
            .setThumbnail(target.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: updated ? "🔨 Ban Updated" : "🔨 Ban", value: `**User:** ${userMention} (${target.tag})`, inline: false },
                { name: "Reason", value: reason, inline: false },
                { name: "Punishment ID", value: punishmentId, inline: true }
            )
            .setTimestamp();
        return embed;
    }
}

module.exports = new BanCommand();
