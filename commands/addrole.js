const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ms = require('ms');

// Command framework
const { ModerationCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorHandler');

// Helpers & services
const { checkTargetHierarchy, handleError, checkModerationPermission } = require('../utils/commandHelpers');
const { generateUniquePunishmentId } = require('../utils/generatePunishmentId');
const { saveModerationAction } = require('../services/moderationActionService');
const { createSmartUserMention } = require('../utils/utils');

// Channel configuration
const channelConfig = require('../config/channels');

// Role configuration for ID-based checking
const roleConfig = require('../config/roles');

// Define restricted roles that can't be assigned by non-admins
const RESTRICTED_ROLES = ['Admins', 'T', 'TraniumBot', 'Mods', 'SrMods', 'Senior Mods', 'Helpers', 'Trial Helpers', 'STAFF', 'Bots', 'Bot Developer', 'Friends', 'Ticket Access', 'Community Manager', 'Event Hosts'];

// Define staff roles that can ONLY be assigned by Admins
const STAFF_ONLY_ROLES = ['Admins', 'T', 'TraniumBot', 'Mods', 'SrMods', 'Senior Mods', 'Helpers', 'Trial Helpers', 'STAFF', 'Bot Developer', 'Community Manager'];

class AddRoleCommand extends ModerationCommand {
    constructor() {
        super(new SlashCommandBuilder()
            .setName('addrole')
            .setDescription('Add a role to a user for a specified duration')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('The user to add the role to')
                    .setRequired(true))
            .addRoleOption(option =>
                option.setName('role')
                    .setDescription('The role to add')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('duration')
                    .setDescription('Duration to keep the role (e.g., 1h, 30m, 1d, forever for permanent)')
                    .setRequired(true)));
    }

    async validateInput(interaction) {
        try {
            console.log(`[ADDROLE] User ${interaction.user.tag} (${interaction.user.id}) is attempting to add a role`);
            console.log(`[ADDROLE] User roles: ${interaction.member.roles.cache.map(r => r.name).join(', ')}`);
            
            // Check for permission - allow Helpers and above
            const hasPermission = await checkModerationPermission(interaction, 'helpers');
            if (!hasPermission) {
                console.log(`[ADDROLE] Permission check failed for ${interaction.user.tag}`);
                throw createValidationError('You do not have permission to use this command');
            }
            
            console.log(`[ADDROLE] Permission check passed for ${interaction.user.tag}`);

            const targetUser = interaction.options.getMember('user');
            const role = interaction.options.getRole('role');
            const durationString = interaction.options.getString('duration');
            const moderator = interaction.member;

            // SPECIAL CASE: Allow adding Out of Office role even to equal rank members
            const roleConfig = require('../config/roles');
            const isOutOfOfficeRole = role.id === roleConfig.getId('OUT_OF_OFFICE');
            
            // If it's not the Out of Office role, check hierarchy
            if (!isOutOfOfficeRole) {
                // Check if target is staff
                if (!await checkTargetHierarchy(interaction, targetUser)) {
                    throw createValidationError('You cannot add roles to someone with higher or equal hierarchy');
                }
            } else {
                console.log(`[ADDROLE] Bypassing hierarchy check for Out of Office role addition`);
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
                console.log(`[ADDROLE] User ${interaction.user.tag} attempted to assign restricted role ${role.name} without permission`);
                throw createValidationError(`You don't have permission to assign the ${role.name} role.`);
            }
            
            // Even more strict check for staff hierarchy roles - only Admins+ can assign these
            const isStaffHierarchyRole = [
                roleConfig.getId('ADMINS'),
                roleConfig.getId('T'),
                roleConfig.getId('MODERATORS'),
                roleConfig.getId('SENIOR_MODERATORS'),
                roleConfig.getId('HELPERS'),
                roleConfig.getId('TRIAL_HELPERS')
            ].includes(role.id);
            
            if (isStaffHierarchyRole && !roleConfig.memberHasRole(moderator, 'ADMINS')) {
                console.log(`[ADDROLE] User ${interaction.user.tag} attempted to assign staff hierarchy role ${role.name} without Admin permission`);
                throw createValidationError(`Only Admins can assign staff hierarchy roles like ${role.name}.`);
            }

            // Check if user already has the role
            if (targetUser.roles.cache.has(role.id)) {
                throw createValidationError(`${targetUser.user.tag} already has the ${role.name} role.`);
            }

            // Parse duration if provided
            let duration = null;
            let endTime = null;
            let isPermanent = false;
            
            if (!durationString) {
                throw createValidationError('Duration is required. Use formats like 1h, 30m, 1d, or "forever" for permanent');
            }
            
            // Check for permanent (forever)
            if (durationString.toLowerCase() === 'forever' || durationString.toLowerCase() === 'permanent') {
                isPermanent = true;
            } else {
                try {
                    duration = ms(durationString);
                    if (duration <= 0) {
                        throw createValidationError('Duration must be a positive value');
                    }
                    endTime = Date.now() + duration;
                } catch (error) {
                    throw createValidationError('Invalid duration format. Use formats like 1h, 30m, 1d, or "forever" for permanent');
                }
            }

            return { targetUser, role, moderator, duration, endTime, durationString, isPermanent };
        } catch (error) {
            // Check if this is a validation error (expected) or a real error (unexpected)
            if (error.type === 'VALIDATION_ERROR') {
                // For validation errors, just log them as info, not errors
                console.log(`[ADDROLE] Validation failed: ${error.message}`);
            } else {
                // For unexpected errors, log them as errors
                console.error(`[ADDROLE] Unexpected error in validation:`, error);
            }
            throw error;
        }
    }

    async executeCommand(interaction) {
        const { targetUser, role, moderator, duration, endTime, durationString, isPermanent } = await this.validateInput(interaction);

        // Add the role
        await targetUser.roles.add(role);

        // Generate punishment ID
        const punishmentId = await generateUniquePunishmentId();
        
        // If not permanent, schedule removal using setTimeout
        if (!isPermanent) {
            try {
                // Schedule removal using setTimeout
                setTimeout(async () => {
                    try {
                        // Import removeRole function
                        const removeRole = require('../utils/removeRole');
                        await removeRole(
                            {
                                guildId: interaction.guild.id,
                                userId: targetUser.id,
                                roleId: role.id,
                                punishmentId,
                                reason: `Temporary role duration expired`
                            },
                            interaction.guild.channels.cache.get(channelConfig.getId('MODERATION_LOG')),
                            interaction.client.user,
                            interaction.client
                        );
                    } catch (error) {
                        console.error('Error removing timed role:', error);
                    }
                }, duration);
            } catch (error) {
                console.error('Error scheduling timed role:', error);
                // Continue even if there's an error with scheduling
            }
        }

        // Save action to database
        await saveModerationAction({
            userId: targetUser.id,
            moderatorId: moderator.id,
            action: 'role_add',
            reason: isPermanent ? `Added role: ${role.name} (permanent)` : `Added role: ${role.name} for ${durationString}`,
            actionId: punishmentId,
            duration: duration,
            active: true,
            metadata: {
                roleId: role.id,
                roleName: role.name
            }
        });

        return {
            target: targetUser.user,
            role,
            moderator,
            punishmentId,
            duration,
            durationString,
            isPermanent
        };
    }

    async sendResponse(interaction, result) {
        const { target, role, durationString, isPermanent } = result;
        
        // Send confirmation to the moderator
        const durationText = isPermanent ? ` permanently` : ` for ${durationString}`;
        await interaction.followUp({
            content: `Successfully added the ${role.name} role to ${target.tag}${durationText}.`,
            flags: ['Ephemeral']
        });

        // Use the showModview helper from commandHelpers if it exists
        try {
            const { showModview } = require('../utils/commandHelpers');
            if (typeof showModview === 'function') {
                await showModview(interaction, target, true);
            } else {
                // Fallback if showModview helper doesn't exist
                const modviewCommand = interaction.client.commands.get('modview');
                if (modviewCommand) {
                    try {
                        const modviewInteraction = {
                            ...interaction,
                            options: {
                                getUser: (name) => {
                                    if (name === 'user') return target;
                                    return null;
                                },
                            },
                            reply: async (data) => {},
                            followUp: async (data) => interaction.followUp(data),
                        };
                        await modviewCommand.execute(modviewInteraction);
                    } catch (modviewErr) {
                        await handleError(interaction, modviewErr, 'showing modview after adding role');
                    }
                }
            }
        } catch (error) {
            console.error('Error showing modview:', error);
            // Continue without showing modview
        }
    }

    async logAction(interaction, result) {
        const { target, role, moderator, punishmentId, durationString, isPermanent } = result;
        
        // Create smart user mentions
        const userMention = await createSmartUserMention(target.id, interaction.client, interaction.guild, { showRawId: true });
        const moderatorMention = await createSmartUserMention(moderator.id, interaction.client, interaction.guild, { showRawId: true });
        
        // Create moderation embed
        const embed = new EmbedBuilder()
            .setColor(0x00FF00) // Green for role add
            .setDescription(`### **Moderation Log**`)
            .setFooter({ text: `Punishment ID: ${punishmentId}` })
            .setThumbnail(target.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: "👥 Role Added", value: `**User:** ${userMention} (${target.tag})`, inline: true },
                { name: "Role", value: role.name, inline: true },
                { name: "Moderator", value: moderatorMention, inline: true }
            );

        // Add duration field
        embed.addFields({ 
            name: "Duration", 
            value: isPermanent ? "Permanent" : durationString, 
            inline: true 
        });

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

module.exports = new AddRoleCommand();
