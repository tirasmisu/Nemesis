const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Command framework
const { ModerationCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorHandler');

// Helpers & services
const { checkModerationPermission, checkTargetHierarchy, handleError } = require('../utils/commandHelpers');
const { generateUniquePunishmentId } = require('../utils/generatePunishmentId');
const { saveModerationAction } = require('../services/moderationActionService');
const { createSmartUserMention } = require('../utils/utils');
const ModerationAction = require('../models/ModerationAction');

// Channel configuration
const channelConfig = require('../config/channels');

// Role configuration for ID-based checking
const roleConfig = require('../config/roles');

// Define restricted roles that can't be removed by non-admins
const RESTRICTED_ROLES = ['Admins', 'T', 'TraniumBot', 'Mods', 'SrMods', 'Senior Mods', 'Helpers', 'Trial Helpers', 'STAFF', 'Bots', 'Bot Developer', 'Friends', 'Ticket Access', 'Community Manager', 'Event Hosts'];

// Define staff roles that can ONLY be removed by Admins
const STAFF_ONLY_ROLES = ['Admins', 'T', 'TraniumBot', 'Mods', 'SrMods', 'Senior Mods', 'Helpers', 'Trial Helpers', 'STAFF', 'Bot Developer', 'Community Manager'];

class RemoveRoleCommand extends ModerationCommand {
    constructor() {
        super(new SlashCommandBuilder()
            .setName('removerole')
            .setDescription('Remove a role from a user')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('The user to remove the role from')
                    .setRequired(true))
            .addRoleOption(option =>
                option.setName('role')
                    .setDescription('The role to remove')
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
            console.log(`[REMOVEROLE] User ${interaction.user.tag} (${interaction.user.id}) is attempting to remove a role`);
            console.log(`[REMOVEROLE] User roles: ${interaction.member.roles.cache.map(r => r.name).join(', ')}`);
            
            // Check permission - allow Mods and above
            const hasPermission = await checkModerationPermission(interaction, 'mods');
            if (!hasPermission) {
                console.log(`[REMOVEROLE] Permission check failed for ${interaction.user.tag}`);
                
                throw createValidationError('You do not have permission to use this command');
            }
            
            console.log(`[REMOVEROLE] Permission check passed for ${interaction.user.tag}`);

            const targetUser = interaction.options.getMember('user');
            const role = interaction.options.getRole('role');
            const moderator = interaction.member;
            
            if (!targetUser) {
                throw createValidationError('Target user not found');
            }

            // SPECIAL CASE: Allow removing Out of Office role even from equal rank members
            const roleConfig = require('../config/roles');
            const isOutOfOfficeRole = role.id === roleConfig.getId('OUT_OF_OFFICE');
            
            // If it's the Out of Office role, skip hierarchy check
            if (!isOutOfOfficeRole) {
                // Check if target is staff
                if (!await checkTargetHierarchy(interaction, targetUser)) {
                    throw createValidationError('You cannot remove roles from someone with equal or higher permission level. Staff members can only modify roles for users with lower hierarchy than themselves.');
                }
            } else {
                console.log(`[REMOVEROLE] Bypassing hierarchy check for Out of Office role removal`);
            }
            
            // Check if role is restricted - use role IDs for security
            const isRestrictedRole = [
                roleConfig.getId('ADMINS'),
                roleConfig.getId('T'),
                roleConfig.getId('MODERATORS'),
                roleConfig.getId('SENIOR_MODERATORS'),
                roleConfig.getId('HELPERS'),
                roleConfig.getId('TRIAL_HELPERS'),
                roleConfig.getId('STAFF'),
                roleConfig.getId('TICKET_ACCESS'),
                roleConfig.getId('EVENT_MANAGERS')
            ].includes(role.id);
            
            if (isRestrictedRole && !roleConfig.memberHasRole(moderator, 'ADMINS') && !roleConfig.memberHasRole(moderator, 'T')) {
                console.log(`[REMOVEROLE] User ${interaction.user.tag} attempted to remove restricted role ${role.name} without permission`);
                throw createValidationError(`You don't have permission to remove the ${role.name} role.`);
            }
            
            // Even more strict check for staff hierarchy roles - only Admins+ can remove these
            const isStaffHierarchyRole = [
                roleConfig.getId('ADMINS'),
                roleConfig.getId('T'),
                roleConfig.getId('MODERATORS'),
                roleConfig.getId('SENIOR_MODERATORS'),
                roleConfig.getId('HELPERS'),
                roleConfig.getId('TRIAL_HELPERS')
            ].includes(role.id);
            
            if (isStaffHierarchyRole && !roleConfig.memberHasRole(moderator, 'ADMINS')) {
                console.log(`[REMOVEROLE] User ${interaction.user.tag} attempted to remove staff hierarchy role ${role.name} without Admin permission`);
                throw createValidationError(`Only Admins can remove staff hierarchy roles like ${role.name}.`);
            }

            // Check if user has the role
            if (!targetUser.roles.cache.has(role.id)) {
                throw createValidationError(`${targetUser.user.tag} doesn't have the ${role.name} role.`);
            }

            return { targetUser, role, moderator };
        } catch (error) {
            // Check if this is a validation error (expected) or a real error (unexpected)
            if (error.type === 'VALIDATION_ERROR') {
                // For validation errors, just log them as info, not errors
                console.log(`[REMOVEROLE] Validation failed: ${error.message}`);
            } else {
                // For unexpected errors, log them as errors
                console.error(`[REMOVEROLE] Unexpected error in validation:`, error);
            }
            throw error;
        }
    }

    async executeCommand(interaction) {
        const { targetUser, role, moderator } = await this.validateInput(interaction);

        // Remove the role
        await targetUser.roles.remove(role);

        // Generate punishment ID
        const punishmentId = await generateUniquePunishmentId();
        
        // Save moderation action
        await saveModerationAction({
            userId: targetUser.id,
            moderatorId: interaction.user.id,
            action: 'role_remove',
            reason: `Removed role: ${role.name}`,
            actionId: punishmentId,
        });

        // Find and deactivate the previous role assignment
        const action = await ModerationAction.findOne({
            userId: targetUser.id,
            action: 'role_add',
            active: true,
        });

        if (action) {
            action.active = false;
            await action.save();
        }

        return {
            target: targetUser.user,
            role,
            moderator: interaction.user,
            punishmentId
        };
    }

    async sendResponse(interaction, result) {
        const { target, role } = result;
        
        // Send confirmation to the moderator
        await interaction.followUp({
            content: `Successfully removed the ${role.name} role from ${target.tag}.`,
            flags: ['Ephemeral']
        });
    }

    async logAction(interaction, result) {
        const { target, role, moderator, punishmentId } = result;
        
        // Create smart user mentions
        const userMention = await createSmartUserMention(target.id, interaction.client, interaction.guild, { showRawId: true });
        const moderatorMention = await createSmartUserMention(moderator.id, interaction.client, interaction.guild, { showRawId: true });
        
        // Create moderation embed
        const embed = new EmbedBuilder()
            .setColor(0xFFA500) // Orange for role removal
            .setDescription(`### **Moderation Log**`)
            .setFooter({ text: `Punishment ID: ${punishmentId}` })
            .setThumbnail(target.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: "👥 Role Removed", value: `**User:** ${userMention} (${target.tag})`, inline: true },
                { name: "Role", value: role.name, inline: true },
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

    async execute(interaction) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ flags: ['Ephemeral'] });
            }
            const result = await this.executeCommand(interaction);
            await this.sendResponse(interaction, result);
            await this.logAction(interaction, result);
        } catch (error) {
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ content: 'An error occurred while processing your request.' });
            } else if (!interaction.replied) {
                await interaction.reply({ content: 'An error occurred while processing your request.', flags: ['Ephemeral'] });
            }
        }
    }
}

module.exports = new RemoveRoleCommand();
