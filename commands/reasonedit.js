const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Command framework
const { BaseCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorHandler');

// Helpers & services
const { checkModerationPermission } = require('../utils/commandHelpers');
const { createSmartUserMention } = require('../utils/utils');
const ModerationAction = require('../models/ModerationAction');

// Channel configuration
const channelConfig = require('../config/channels');

class ReasonEditCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('reasonedit')
                .setDescription('Edit the reason for a specific punishment')
                .addStringOption(option =>
                    option.setName('punishmentid')
                        .setDescription('The punishment ID to edit')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('newreason')
                        .setDescription('The new reason for the punishment')
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
        if (!await checkModerationPermission(interaction, 'helpers')) {
            throw createValidationError('You do not have permission to use this command');
        }
        
        const punishmentId = interaction.options.getString('punishmentid');
        const newReason = interaction.options.getString('newreason');

        // Find the punishment by its ID
        const punishment = await ModerationAction.findOne({ actionId: punishmentId });
        if (!punishment) {
            throw createValidationError(`No punishment found with ID: ${punishmentId}`);
        }

        return { punishmentId, newReason, punishment };
    }

    async executeCommand(interaction) {
        const { punishmentId, newReason, punishment } = await this.validateInput(interaction);
        
        const oldReason = punishment.reason;
        
        // Update the punishment reason in the database
        await ModerationAction.updateOne(
            { actionId: punishmentId },
            { reason: newReason }
        );
        
        return {
            punishment,
            oldReason,
            newReason,
            moderator: interaction.user
        };
    }

    async sendResponse(interaction, result) {
        const { punishment, oldReason, newReason } = result;
        
        // Send confirmation to the moderator
        await interaction.editReply({
            content: `✅ Punishment ID: \`${punishment.actionId}\` has been updated.\n\n**Old Reason:** ${oldReason}\n**New Reason:** ${newReason}`
        });

        // Notify the user about the updated reason
        try {
            const user = await interaction.guild.members.fetch(punishment.userId);
            if (user) {
                await user.send(`The reason for your punishment in **${interaction.guild.name}** has been updated from **"${oldReason}"** to **"${newReason}"**.`);
            }
        } catch (err) {
            console.error('Could not send DM to the user about the updated reason:', err);
        }
    }

    async logAction(interaction, result) {
        const { punishment, oldReason, newReason, moderator } = result;
        
        // Create smart user mentions
        const userMention = await createSmartUserMention(punishment.userId, interaction.client, interaction.guild, { showRawId: true });
        const moderatorMention = await createSmartUserMention(moderator.id, interaction.client, interaction.guild, { showRawId: true });
        
        // Create moderation embed
        const embed = new EmbedBuilder()
            .setColor(0x3498DB) // Blue for edits
            .setDescription(`### **Moderation Log**`)
            .setFooter({ text: `Punishment ID: ${punishment.actionId}` })
            .addFields(
                { name: "📝 Reason Edited", value: `**Action:** ${punishment.action.toUpperCase()}`, inline: false },
                { name: "User", value: userMention, inline: true },
                { name: "Moderator", value: moderatorMention, inline: true },
                { name: "Old Reason", value: oldReason, inline: false },
                { name: "New Reason", value: newReason, inline: false }
            )
            .setTimestamp();

        // Get log channel from config and send the embed
        const logChannelId = channelConfig.getId('MODERATION_LOG');
        const logChannel = interaction.guild.channels.cache.get(logChannelId);
        
        if (logChannel) {
            await logChannel.send({ embeds: [embed] });
        }
    }

    async createResponseEmbed(result, interaction) {
        const { punishment, oldReason, newReason } = result;
        
        // Create smart user mentions
        const userMention = await createSmartUserMention(punishment.userId, interaction.client, interaction.guild, { showRawId: true });
        const moderatorMention = await createSmartUserMention(result.moderator.id, interaction.client, interaction.guild, { showRawId: true });
        
        // Create moderation embed
        const embed = new EmbedBuilder()
            .setColor(0x3498DB) // Blue for edits
            .setDescription(`### **Moderation Log**`)
            .setFooter({ text: `Punishment ID: ${punishment.actionId}` })
            .addFields(
                { name: "📝 Reason Edited", value: `**Action:** ${punishment.action.toUpperCase()}`, inline: false },
                { name: "User", value: userMention, inline: true },
                { name: "Moderator", value: moderatorMention, inline: true },
                { name: "Old Reason", value: oldReason, inline: false },
                { name: "New Reason", value: newReason, inline: false }
            )
            .setTimestamp();

        return embed;
    }
}

module.exports = new ReasonEditCommand();
