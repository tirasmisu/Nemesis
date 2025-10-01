const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ms = require('ms');

// Command framework
const { ModerationCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorHandler');

// Helpers & services
const { checkModerationPermission } = require('../utils/commandHelpers');
const { generateUniquePunishmentId } = require('../utils/generatePunishmentId');
const { saveModerationAction } = require('../services/moderationActionService');
const ModerationAction = require('../models/ModerationAction');
const { notifyUser } = require('../utils/utils');
const { scheduleUnmute } = require('../utils/muteManager');

// Channel configuration
const channelConfig = require('../config/channels');

// Role configuration for ID-based checking
const roleConfig = require('../config/roles');

class MuteCommand extends ModerationCommand {
    constructor() {
        super(new SlashCommandBuilder()
            .setName('mute')
            .setDescription('Mute a user for a specified duration')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('The user to mute')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('duration')
                    .setDescription('Duration of the mute (e.g., 1h, 30m, 1d)')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for the mute')
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
            console.log(`[MUTE] User ${interaction.user.tag} (${interaction.user.id}) is attempting to mute a user`);
            console.log(`[MUTE] User roles: ${interaction.member.roles.cache.map(r => r.name).join(', ')}`);
            
            // Check permission - allow Helpers and above
            const hasPermission = await checkModerationPermission(interaction, 'helpers');
            if (!hasPermission) {
                console.log(`[MUTE] Permission check failed for ${interaction.user.tag}`);
                throw createValidationError('You do not have permission to use this command');
            }
            
            console.log(`[MUTE] Permission check passed for ${interaction.user.tag}`);

            const target = interaction.options.getUser('user');
            if (!target) {
                throw createValidationError('User option is required');
            }
            
            const duration = interaction.options.getString('duration');
            const reason = interaction.options.getString('reason');

            // Validate duration
            let durationMs;
            let isPermanent = false;
            
            // Check for permanent (forever)
            if (duration.toLowerCase() === 'forever' || duration.toLowerCase() === 'permanent') {
                isPermanent = true;
                durationMs = null; // Permanent mutes don't have a duration
            } else {
                durationMs = ms(duration);
                if (!durationMs) {
                    throw createValidationError('Invalid duration format. Please use formats like 1h, 30m, 1d, or "forever" for permanent');
                }
            }

            // Check if user is already muted
            const activeMute = await this.checkActiveMute(target.id);
            if (activeMute) {
                throw createValidationError(`User ${target.tag} is already muted. Active mute ID: ${activeMute.actionId}`);
            }

            return { target, duration, durationMs, reason, isPermanent };
        } catch (error) {
            console.error(`[MUTE] Error in validation:`, error);
            throw error;
        }
    }

    async executeCommand(interaction) {
        try {
            // Get input values - validation already done in base class
            const target = interaction.options.getUser('user');
            const duration = interaction.options.getString('duration');
            const reason = interaction.options.getString('reason');

            // Validate duration
            let durationMs;
            let isPermanent = false;
            
            // Check for permanent (forever)
            if (duration.toLowerCase() === 'forever' || duration.toLowerCase() === 'permanent') {
                isPermanent = true;
                durationMs = null; // Permanent mutes don't have a duration
            } else {
                durationMs = ms(duration);
                if (!durationMs) {
                    throw createValidationError('Invalid duration format. Please use formats like 1h, 30m, 1d, or "forever" for permanent');
                }
            }

            // Check if user is already muted
            const activeMute = await this.checkActiveMute(target.id);
            if (activeMute) {
                throw createValidationError(`User ${target.tag} is already muted. Active mute ID: ${activeMute.actionId}`);
            }
            
            const muteRole = interaction.guild.roles.cache.get(roleConfig.getId('MUTED'));
            
            if (!muteRole) {
                throw new Error('Mute role not found');
            }

            const punishmentId = await generateUniquePunishmentId();
            
            // Make sure the member exists in the guild
            const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
            if (!targetMember) {
                throw createValidationError('User is not in this server');
            }

            // Save moderation action FIRST before adding role to ensure consistency
            const expiryTime = isPermanent ? null : new Date(Date.now() + durationMs);
            let dbSaved = false;
            try {
                await saveModerationAction({
                    userId: target.id,
                    moderatorId: interaction.user.id,
                    action: 'mute',
                    reason,
                    duration,
                    actionId: punishmentId,
                    timestamp: new Date(),
                    expiryTime,
                    active: true,
                    guildId: interaction.guild.id,
                    roleId: muteRole.id,
                    endTime: isPermanent ? null : expiryTime.getTime()
                });
                dbSaved = true;
                console.log(`[MUTE] Successfully saved mute to database for ${target.tag}`);
            } catch (dbError) {
                console.error(`[MUTE] CRITICAL: Failed to save mute to database for ${target.tag}:`, dbError);
                throw new Error('Failed to save mute record to database. Mute cancelled to prevent orphaned role.');
            }

            // Only add role if database save was successful
            try {
                await targetMember.roles.add(muteRole);
                console.log(`[MUTE] Successfully added mute role to ${target.tag}`);
            } catch (roleError) {
                console.error(`[MUTE] Failed to add mute role to ${target.tag}:`, roleError);
                
                // If role add failed, remove the database record to maintain consistency
                try {
                    await ModerationAction.findOneAndUpdate(
                        { actionId: punishmentId },
                        { active: false }
                    );
                    console.log(`[MUTE] Cleaned up database record after role add failure`);
                } catch (cleanupError) {
                    console.error(`[MUTE] Failed to cleanup database after role error:`, cleanupError);
                }
                
                throw new Error('Failed to add mute role. Please try again.');
            }

            // Schedule the auto unmute using the mute manager (only for non-permanent mutes)
            if (!isPermanent) {
                const muteData = {
                    userId: target.id,
                    actionId: punishmentId, // scheduleUnmute expects actionId, not punishmentId
                    duration: duration,
                    timestamp: new Date() // scheduleUnmute expects timestamp
                };
                
                console.log(`[MUTE] Scheduling unmute for ${target.tag} in ${duration} (${durationMs}ms)`);
                
                // Use the central mute manager to schedule the unmute
                scheduleUnmute(interaction.client, muteData);
            } else {
                console.log(`[MUTE] Permanent mute applied to ${target.tag} - no unmute scheduled`);
            }

            // Try to notify the user using the standardized utility
            const notified = await notifyUser(target, interaction.guild, 'muted', duration, reason);

            return {
                target,
                reason,
                duration,
                punishmentId,
                moderator: interaction.user,
                expiryTime,
                notified,
                success: true
            };
        } catch (error) {
            console.error(`[MUTE] Error in executeCommand:`, error);
            throw error;
        }
    }

    async sendResponse(interaction, result) {
        if (result.error) {
            const message = result.message || 'An error occurred while processing your request.';
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ content: message });
            } else if (!interaction.replied) {
                await interaction.reply({ content: message, flags: ['Ephemeral'] });
            }
            return;
        }

        if (result.success) {
            // Send confirmation with DM status
            let confirmationMessage = `Successfully muted ${result.target.tag} for ${result.duration}.`;
            if (!result.notified) {
                confirmationMessage += ` ⚠️ Could not notify user (DMs disabled or blocked).`;
            }

            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({
                    content: confirmationMessage,
                    flags: ['Ephemeral']
                });
            } else if (!interaction.replied) {
                await interaction.reply({
                    content: confirmationMessage,
                    flags: ['Ephemeral']
                });
            }
        }
    }

    async checkActiveMute(userId) {
        return await ModerationAction.findOne({
            userId,
            action: 'mute',
            active: true
        });
    }

    async handleUnmute(user, punishmentId, guild) {
        const result = await ModerationAction.findOneAndUpdate(
            { userId: user.id, action: 'mute', actionId: punishmentId, active: true },
            { active: false }
        );

        if (result) {
            // Get log channel from config
            const logChannelId = channelConfig.getId('MODERATION_LOG');
            const logChannel = guild.channels.cache.get(logChannelId);

            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setDescription('### **Moderation Log**')
                    .setTitle('🔊 Auto-Unmute')
                    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                    .addFields(
                        { name: "User", value: `<@${user.id}> (${user.tag})`, inline: true },
                        { name: "Action", value: "Unmute", inline: true },
                        { name: "Original Punishment ID", value: punishmentId, inline: false }
                    )
                    .setTimestamp();

                await logChannel.send({ embeds: [embed] });
            }
        }
    }
}

module.exports = new MuteCommand();
