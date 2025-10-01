const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { ModerationCommand } = require('../utils/commandTemplate');
const { createValidationError } = require('../utils/errorManager');
const { checkModerationPermission, checkTargetHierarchy, showModview } = require('../utils/commandHelpers');
const { notifyUser, createStandardEmbed, createSmartUserMention } = require('../utils/utils');
const { generateUniquePunishmentId } = require('../utils/generatePunishmentId');
const { saveModerationAction } = require('../services/moderationActionService');
const channelConfig = require('../config/channels');

class WarnCommand extends ModerationCommand {
    constructor() {
        super(new SlashCommandBuilder()
            .setName('warn')
            .setDescription('Warn a user')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('The user to warn')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for the warning')
                    .setRequired(true)));
                    
        this.category = 'moderation';
    }

    shouldDeferReply() {
        return true;
    }

    isEphemeral() {
        return true;
    }

    async validateInput(interaction) {
        try {
            console.log(`[WARN] User ${interaction.user.tag} (${interaction.user.id}) is attempting to warn someone`);
            console.log(`[WARN] User roles: ${interaction.member.roles.cache.map(r => r.name).join(', ')}`);
            
            // Step 1: Permission Check - require helpers or higher
            const hasPermission = await checkModerationPermission(interaction, 'helpers');
            if (!hasPermission) {
                console.log(`[WARN] Permission check failed for ${interaction.user.tag}`);
                // No need to reply here as checkModerationPermission already handles that
                return false;
            }

            console.log(`[WARN] Permission check passed for ${interaction.user.tag}`);

            const targetUser = interaction.options.getMember('user');
            if (!targetUser) {
                throw createValidationError('User not found in this server.');
            }

            const reason = interaction.options.getString('reason');
            if (!reason) {
                throw createValidationError('You must provide a reason for the warning.');
            }

            // Step 3: Check Target Hierarchy - make sure we handle already replied interactions
            if (!await checkTargetHierarchy(interaction, targetUser)) {
                // No need to throw, checkTargetHierarchy now handles replies
                return false;
            }

            return { user: targetUser, reason };
        } catch (error) {
            console.error(`[WARN] Error in warn validation:`, error);
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: error.message || 'An error occurred while validating your command.',
                        flags: ['Ephemeral']
                    });
                } else {
                    await interaction.editReply({
                        content: error.message || 'An error occurred while validating your command.'
                    });
                }
            } catch (replyError) {
                console.error('[WARN] Error sending error message:', replyError);
            }
            return false;
        }
    }

    async execute(interaction) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ flags: ['Ephemeral'] });
            }
            const validation = await this.validateInput(interaction);
            if (!validation) return;
            const user = interaction.options.getMember('user');
            const reason = interaction.options.getString('reason');
            const moderator = interaction.user;
            
            console.log(`[WARN] Executing warn for ${user.user.tag} (${user.id}) by ${moderator.tag} (${moderator.id})`);

            // Generate Punishment ID and Save Action
            const punishmentId = await generateUniquePunishmentId();
            await saveModerationAction({
                userId: user.id,
                moderatorId: moderator.id,
                action: 'warn',
                reason: reason,
                actionId: punishmentId,
                metadata: {
                        notified: true
                }
            });

            console.log(`[WARN] Created punishment with ID ${punishmentId}`);

            // Always notify the user
            let notified = false;
            try {
                await user.user.send({
                    embeds: [new EmbedBuilder()
                        .setColor(0xFFAA00)
                        .setTitle('You have been warned')
                        .setDescription(`You have been warned in ${interaction.guild.name}`)
                        .addFields(
                            { name: 'Reason', value: reason, inline: false },
                            { name: 'Moderator', value: `${moderator.tag}`, inline: true },
                            { name: 'Warning ID', value: punishmentId, inline: true }
                        )
                        .setTimestamp()
                    ]
                });
                notified = true;
                console.log(`[WARN] Successfully DMed user ${user.user.tag}`);
            } catch (err) {
                console.error(`[WARN] Failed to DM user ${user.user.tag}:`, err);
                notified = false;
            }

            const userMention = await createSmartUserMention(user.id, interaction.client, interaction.guild, { showRawId: true });
            const moderatorMention = await createSmartUserMention(moderator.id, interaction.client, interaction.guild, { showRawId: true });
            
            const embed = new EmbedBuilder()
                .setColor(0xFFAA00)
                .setTitle('Warning Issued')
                .setDescription(`Warning issued successfully. Warning ID: ${punishmentId}`)
                .addFields(
                    { name: 'User', value: `${userMention} (${user.user.tag})`, inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Moderator', value: `${moderatorMention} (${moderator.tag})`, inline: true },
                    { name: 'Warning ID', value: punishmentId, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Show Modview using the helper
            await showModview(interaction, user.user, true);

            // Show notification status if needed
            if (!notified) {
                await interaction.followUp({
                    content: `Warning issued but could not notify user (they may have DMs disabled). Warning ID: ${punishmentId}`,
                    flags: ['Ephemeral']
                });
            }

            return {
                target: user,
                reason,
                punishmentId,
                userNotified: notified,
                success: true
            };
        } catch (error) {
            console.error(`[WARN] Error in warn execution:`, error);
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ content: 'An error occurred while processing your request.' });
            } else if (!interaction.replied) {
                await interaction.reply({ content: 'An error occurred while processing your request.', flags: ['Ephemeral'] });
            }
            return {
                success: false,
                error: error.message || 'Unknown error'
            };
        }
    }

    async logAction(interaction, result) {
        if (!result.success) return;

        // Create smart user mentions
        const userMention = await createSmartUserMention(result.target.id, interaction.client, interaction.guild, { showRawId: true });
        const moderatorMention = await createSmartUserMention(interaction.user.id, interaction.client, interaction.guild, { showRawId: true });

        // Create Log Embed using standardized utility
        const logEmbed = createStandardEmbed({
            color: 0xFFA500,
            description: '### **Warning Issued**',
            fields: [
                { name: "User", value: `${userMention} (${result.target.user.tag})`, inline: true },
                { name: "Reason", value: result.reason, inline: true },
                { name: "Moderator", value: `${moderatorMention} (${interaction.user.tag})`, inline: true },
                { name: "Warning ID", value: result.punishmentId, inline: true },
                { name: "User Notified", value: result.userNotified ? "Yes" : "No", inline: true }
            ]
        });

        // Get log channel and send embed
        const logChannelId = channelConfig.getId('STAFF_LOGS');
        const logChannel = interaction.guild.channels.cache.get(logChannelId);
        
        if (logChannel) {
            await logChannel.send({ embeds: [logEmbed] });
        }
    }
}

module.exports = new WarnCommand();
