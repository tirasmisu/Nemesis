const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Command framework
const { BaseCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorHandler');

// Helpers & services
const { checkModerationPermission } = require('../utils/commandHelpers');
const { generateUniquePunishmentId } = require('../utils/generatePunishmentId');
const { saveModerationAction } = require('../services/moderationActionService');

// Channel configuration
const channelConfig = require('../config/channels');

class LockCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('lock')
                .setDescription('Locks or unlocks the current channel for regular members')
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
            throw createValidationError('You do not have permission to use this command.');
        }
        const channel = interaction.channel;
        return { channel };
    }

    async executeCommand(interaction) {
        const { channel } = await this.validateInput(interaction);
        const everyoneRole = interaction.guild.roles.everyone;
        const isLocked = !channel.permissionsFor(everyoneRole).has('SendMessages');

        try {
            if (isLocked) {
                await channel.permissionOverwrites.delete(everyoneRole);
            } else {
                await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: false });
            }
        } catch {
            throw new Error('Failed to toggle channel lock. Please check my permissions and try again.');
        }

        const punishmentId = await generateUniquePunishmentId();
        const actionText = isLocked ? 'unlock' : 'lock';

        await saveModerationAction({
            userId: interaction.user.id,
            moderatorId: interaction.user.id,
            action: actionText,
            reason: `Channel ${channel.name} (${channel.id}) was ${actionText}ed`,
            actionId: punishmentId,
        });

        return { 
            actionText, 
            channel, 
            isLocked, 
            moderator: interaction.user, 
            punishmentId 
        };
    }

    async sendResponse(interaction, result) {
        const { actionText } = result;
        await interaction.followUp({ 
            content: `This channel has been ${actionText}ed.`, 
            flags: undefined 
        });
    }

    async logAction(interaction, result) {
        const { channel, isLocked, moderator, punishmentId } = result;
        
        // Create moderation embed
        const embed = new EmbedBuilder()
            .setColor(isLocked ? 0x00ff00 : 0xff0000)
            .setDescription('### **Moderation Log**')
            .setFooter({ text: `Punishment ID: ${punishmentId}` })
            .addFields(
                { name: isLocked ? '🔓 Channel Unlocked' : '🔒 Channel Locked', value: `**Channel:** ${channel}`, inline: true },
                { name: 'Moderator', value: `<@${moderator.id}>`, inline: true },
                { name: 'Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
            )
            .setTimestamp();

        // Get log channel from config and send the embed
        const logChannelId = channelConfig.getId('SERVER_LOG');
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
        } catch (error) {
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ content: 'An error occurred while processing your request.' });
            } else if (!interaction.replied) {
                await interaction.reply({ content: 'An error occurred while processing your request.', flags: ['Ephemeral'] });
            }
        }
    }
}

module.exports = new LockCommand();
