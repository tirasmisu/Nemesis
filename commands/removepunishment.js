const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Command framework
const { BaseCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorHandler');

// Helpers & services
const { checkModerationPermission, handleError } = require('../utils/commandHelpers');
const ModerationAction = require('../models/ModerationAction');

// Channel configuration
const channelConfig = require('../config/channels');

class RemovePunishmentCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('removepunishment')
                .setDescription('Remove a punishment by its ID (permanently deletes from database)')
                .addStringOption(option =>
                    option.setName('punishmentid')
                        .setDescription('The ID of the punishment to remove')
                        .setRequired(true))
        );
    }

    shouldDeferReply() {
        return true;
    }

    isEphemeral() {
        return true;
    }

    shouldLogAction() {
        return true;
    }

    async validateInput(interaction) {
        if (!await checkModerationPermission(interaction, 'mods')) {
            throw createValidationError('You do not have permission to use this command');
        }
        
        const punishmentId = interaction.options.getString('punishmentid');
        if (!punishmentId) {
            throw createValidationError('Punishment ID is required');
        }

        // Find the punishment
        const punishment = await ModerationAction.findOne({ actionId: punishmentId });
        if (!punishment) {
            throw createValidationError('No punishment found with that ID');
        }

        return { punishmentId, punishment };
    }

    async executeCommand(interaction) {
        const { punishmentId, punishment } = await this.validateInput(interaction);

        // Store punishment details before deletion for logging
        const punishmentDetails = {
            actionId: punishment.actionId,
            action: punishment.action,
            userId: punishment.userId,
            reason: punishment.reason,
            duration: punishment.duration,
            timestamp: punishment.timestamp,
            moderatorId: punishment.moderatorId
        };

        // Actually delete the punishment from the database
        await ModerationAction.deleteOne({ actionId: punishmentId });

        console.log(`[REMOVE_PUNISHMENT] Deleted punishment ${punishmentId} from database`);

        return {
            punishmentId,
            punishment: punishmentDetails, // Use stored details for logging
            moderator: interaction.user,
            deleted: true
        };
    }

    async sendResponse(interaction, result) {
        const { punishmentId } = result;
        
        await interaction.editReply({
            content: `✅ Successfully **deleted** punishment ${punishmentId} from the database.`,
            flags: ['Ephemeral']
        });
    }

    async logAction(interaction, result) {
        const { punishmentId, punishment, moderator } = result;
        
        // Create moderation embed
        const embed = new EmbedBuilder()
            .setColor(0xFF0000) // Red for deletion
            .setDescription(`### **Moderation Log**`)
            .setFooter({ text: `Deleted Punishment ID: ${punishmentId}` })
            .addFields(
                { name: "🗑️ Punishment Deleted", value: `**ID:** ${punishmentId}`, inline: true },
                { name: "Action", value: punishment.action.toUpperCase(), inline: true },
                { name: "User", value: `<@${punishment.userId}>`, inline: true },
                { name: "Moderator", value: `<@${moderator.id}>`, inline: true },
                { name: "Original Reason", value: punishment.reason || "No reason provided", inline: false },
                { name: "Original Duration", value: punishment.duration || "N/A", inline: true },
                { name: "Original Time", value: `<t:${Math.floor(new Date(punishment.timestamp).getTime() / 1000)}:F>`, inline: true },
                { name: "Deletion Time", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
            )
            .setTimestamp();

        // Get log channel from config and send the embed
        const logChannelId = channelConfig.getId('MODERATION_LOG');
        const logChannel = interaction.guild.channels.cache.get(logChannelId);
        
        if (logChannel) {
            await logChannel.send({ embeds: [embed] });
        }
    }

    async execute(interaction) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ flags: ['Ephemeral'] });
            }
            const validation = await this.validateInput(interaction);
            if (!validation) return;
            const result = await this.executeCommand(interaction);
            await this.sendResponse(interaction, result);
            await this.logAction(interaction, result);
        } catch (error) {
            console.error(`[REMOVE_PUNISHMENT] Error:`, error);
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ content: 'An error occurred while processing your request.' });
            } else if (!interaction.replied) {
                await interaction.reply({ content: 'An error occurred while processing your request.', flags: ['Ephemeral'] });
            }
        }
    }
}

module.exports = new RemovePunishmentCommand();
