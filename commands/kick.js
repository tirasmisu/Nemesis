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

class KickCommand extends ModerationCommand {
    constructor() {
        super(new SlashCommandBuilder()
            .setName('kick')
            .setDescription('Kick a user from the server')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('The user to kick')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for the kick')
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

        // Get target member
        const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (!targetMember) {
            throw createValidationError('Could not find the specified user in the server.');
        }

        return { target, targetMember, reason };
    }

    async execute(interaction) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ flags: ['Ephemeral'] });
            }
            const { target, targetMember, reason } = await this.validateInput(interaction);
            const punishmentId = await generateUniquePunishmentId();

            // Kick the user
            await targetMember.kick(reason);

            // Save moderation action
            await saveModerationAction({
                userId: target.id,
                moderatorId: interaction.user.id,
                action: 'kick',
                reason,
                actionId: punishmentId,
                timestamp: new Date()
            });

            const result = {
                target,
                reason,
                punishmentId,
                moderator: interaction.user
            };

            await this.sendResponse(interaction, result);
            await this.logAction(interaction, result);
            await interaction.editReply({ embeds: [await this.createModerationEmbed(result, interaction.client, interaction.guild)] });
        } catch (error) {
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ content: 'An error occurred while processing your request.' });
            } else if (!interaction.replied) {
                await interaction.reply({ content: 'An error occurred while processing your request.', flags: ['Ephemeral'] });
            }
        }
    }

    async sendResponse(interaction, result) {
        const { target, reason } = result;
        
        // Try to notify the user using the standardized utility
        const dmSent = await notifyUser(target, interaction.guild, 'kicked', null, reason);

        // Send confirmation with DM status
        let confirmationMessage = `Successfully kicked ${target.tag}.`;
        if (!dmSent) {
            confirmationMessage += ` ⚠️ Could not notify user (DMs disabled or blocked).`;
        }

        await interaction.followUp({
            content: confirmationMessage,
            flags: ['Ephemeral']
        });
    }

    async logAction(interaction, result) {
        const { target, reason, moderator, punishmentId } = result;

        // Create smart user mentions
        const userMention = await createSmartUserMention(target.id, interaction.client, interaction.guild, { showRawId: true });
        const moderatorMention = await createSmartUserMention(moderator.id, interaction.client, interaction.guild, { showRawId: true });

        // Create moderation embed
        const embed = new EmbedBuilder()
            .setColor(0xFF6347) // Tomato color for kicks
            .setDescription(`### **Moderation Log**`)
            .setFooter({ text: `Punishment ID: ${punishmentId}` })
            .setThumbnail(target.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: "👢 Kick", value: `**User:** ${userMention} (${target.tag})`, inline: false },
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

    async createModerationEmbed(result, client, guild) {
        const { target, reason, punishmentId } = result;

        // Create smart user mentions
        const userMention = await createSmartUserMention(target.id, client, guild, { showRawId: true });
        const moderatorMention = await createSmartUserMention(result.moderator.id, client, guild, { showRawId: true });

        // Create moderation embed
        const embed = new EmbedBuilder()
            .setColor(0xFF6347) // Tomato color for kicks
            .setDescription(`### **Moderation Log**`)
            .setFooter({ text: `Punishment ID: ${punishmentId}` })
            .setThumbnail(target.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: "👢 Kick", value: `**User:** ${userMention} (${target.tag})`, inline: false },
                { name: "Reason", value: reason, inline: false },
                { name: "Moderator", value: moderatorMention, inline: true }
            )
            .setTimestamp();

        return embed;
    }
}

module.exports = new KickCommand();
