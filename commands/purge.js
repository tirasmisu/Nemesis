const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Command framework
const { BaseCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorManager');

// Helpers & services
const { checkModerationPermission, handleError } = require('../utils/commandHelpers');
const { generateUniquePunishmentId } = require('../utils/generatePunishmentId');
const { saveModerationAction } = require('../services/moderationActionService');
const { createStandardEmbed } = require('../utils/utils');

// Channel configuration
const channelConfig = require('../config/channels');

class PurgeCommand extends BaseCommand {
    constructor() {
        super(new SlashCommandBuilder()
            .setName('purge')
            .setDescription('Deletes a specified number of messages from the channel')
            .addIntegerOption(option =>
                option.setName('amount')
                    .setDescription('The number of messages to delete (1-100)')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(100)));
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

        const amount = interaction.options.getInteger('amount');

        // Check if channel is text channel
        if (!interaction.channel.isTextBased()) {
            throw createValidationError("This command can only be used in text channels.");
        }

        return { amount };
    }

    async execute(interaction) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ flags: ['Ephemeral'] });
            }
            const validation = await this.validateInput(interaction);
            if (!validation) return;
            const { amount } = validation;

            // Delete messages
            const messages = await interaction.channel.messages.fetch({ limit: amount });
            const deletedMessages = await interaction.channel.bulkDelete(messages, true);
            
            // Generate punishment ID
            const punishmentId = await generateUniquePunishmentId();

            // Save action to database
            await saveModerationAction({
                userId: 'CHANNEL_' + interaction.channel.id,
                moderatorId: interaction.user.id,
                action: 'purge',
                reason: `Purged ${deletedMessages.size} messages in #${interaction.channel.name}`,
                actionId: punishmentId,
            });

            // Create moderation embed using the standardized utility
            const embed = createStandardEmbed({
                color: 0x00FFFF, // Cyan for purge
                description: '### **Moderation Log**',
                footer: { text: `Punishment ID: ${punishmentId}` },
                fields: [
                    { name: "🧹 Purge", value: `**Channel:** ${interaction.channel}`, inline: true },
                    { name: "Amount", value: `${deletedMessages.size} messages`, inline: true },
                    { name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
                    { name: "Time", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                ]
            });

            // Get log channel from config and send the embed
            const logChannelId = channelConfig.getId('MODERATION_LOG');
            const logChannel = interaction.guild.channels.cache.get(logChannelId);
            
            if (logChannel) {
                await logChannel.send({ embeds: [embed] });
            }

            await interaction.editReply({
                content: `Successfully deleted ${deletedMessages.size} messages.`,
                flags: ['Ephemeral']
            });
        } catch (error) {
            if (error.message && error.message.includes('14 days old')) {
                throw createValidationError('Cannot delete messages older than 14 days.');
            }
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ content: 'An error occurred while processing your request.' });
            } else if (!interaction.replied) {
                await interaction.reply({ content: 'An error occurred while processing your request.', flags: ['Ephemeral'] });
            }
        }
    }
}

module.exports = new PurgeCommand();
