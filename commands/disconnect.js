const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Command framework
const { ModerationCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorManager');

// Helpers & services
const { checkModerationPermission, checkTargetHierarchy } = require('../utils/commandHelpers');
const { generateUniquePunishmentId } = require('../utils/generatePunishmentId');
const { saveModerationAction } = require('../services/moderationActionService');
const { notifyUser, createSmartUserMention } = require('../utils/utils');

// Channel configuration
const channelConfig = require('../config/channels');

class DisconnectCommand extends ModerationCommand {
    constructor() {
        super(new SlashCommandBuilder()
            .setName('disconnect')
            .setDescription('Disconnect a user from their current voice channel')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('The user to disconnect')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for the disconnect')
                    .setRequired(true)));
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
        try {
            console.log(`[DISCONNECT] User ${interaction.user.tag} (${interaction.user.id}) is attempting to disconnect a user`);
            
            // Check permission - allow Helpers and above
            const hasPermission = await checkModerationPermission(interaction, 'helpers');
            if (!hasPermission) {
                console.log(`[DISCONNECT] Permission check failed for ${interaction.user.tag}`);
                throw createValidationError('You do not have permission to use this command');
            }
            
            console.log(`[DISCONNECT] Permission check passed for ${interaction.user.tag}`);

            const target = interaction.options.getUser('user');
            if (!target) {
                throw createValidationError('User option is required');
            }
            
            const reason = interaction.options.getString('reason');
            if (!reason) {
                throw createValidationError('Reason is required');
            }

            // Get the target member
            const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
            if (!targetMember) {
                throw createValidationError('User is not in this server');
            }

            // Check if user is in a voice channel
            if (!targetMember.voice.channel) {
                throw createValidationError('User is not currently in a voice channel');
            }

            // Check hierarchy (unless it's a special case where we need to moderate someone who blocked us)
            if (!await checkTargetHierarchy(interaction, targetMember)) {
                throw createValidationError('You cannot disconnect a user with equal or higher hierarchy');
            }

            return { target, targetMember, reason, voiceChannel: targetMember.voice.channel };
        } catch (error) {
            console.error(`[DISCONNECT] Error in validation:`, error);
            throw error;
        }
    }

    async executeCommand(interaction) {
        const result = await this.validateInput(interaction);
        const { target, targetMember, reason, voiceChannel } = result;

        const punishmentId = await generateUniquePunishmentId();
        
        // Disconnect the user from voice
        await targetMember.voice.disconnect(reason);

        // Save moderation action
        await saveModerationAction({
            userId: target.id,
            moderatorId: interaction.user.id,
            action: 'voice_disconnect',
            reason,
            actionId: punishmentId,
            timestamp: new Date(),
            metadata: {
                voiceChannelId: voiceChannel.id,
                voiceChannelName: voiceChannel.name
            }
        });

        return {
            target,
            reason,
            punishmentId,
            moderator: interaction.user,
            voiceChannel
        };
    }

    async sendResponse(interaction, result) {
        const { target, reason, voiceChannel } = result;
        
        // Try to notify the user
        const notified = await notifyUser(target, interaction.guild, 'disconnected from voice', null, reason);
        
        // Send confirmation with DM status
        let confirmationMessage = `Successfully disconnected ${target.tag} from ${voiceChannel.name}.`;
        if (!notified) {
            confirmationMessage += ` ⚠️ Could not notify user (DMs disabled or blocked).`;
        }

        await interaction.followUp({
            content: confirmationMessage,
            flags: ['Ephemeral']
        });
    }

    async logAction(interaction, result) {
        const { target, reason, moderator, punishmentId, voiceChannel } = result;

        // Create smart user mentions
        const userMention = await createSmartUserMention(target.id, interaction.client, interaction.guild, { showRawId: true });
        const moderatorMention = await createSmartUserMention(moderator.id, interaction.client, interaction.guild, { showRawId: true });

        // Create moderation embed
        const embed = new EmbedBuilder()
            .setColor(0xFF6B35) // Orange-red for disconnect
            .setDescription(`### **Moderation Log**`)
            .setFooter({ text: `Action ID: ${punishmentId}` })
            .setThumbnail(target.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: "🔊 Voice Disconnect", value: `**User:** ${userMention} (${target.tag})`, inline: false },
                { name: "Reason", value: reason, inline: false },
                { name: "Voice Channel", value: voiceChannel.name, inline: true },
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
}

module.exports = new DisconnectCommand(); 
