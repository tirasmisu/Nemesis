const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const UserXP = require('../models/UserXP');
const { BaseCommand } = require('../utils/commandTemplate');
const { createValidationError } = require('../utils/errorHandler');
const { checkModerationPermission } = require('../utils/commandHelpers');

class ResetLevelCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('resetlevel')
                .setDescription('Reset a user\'s XP and level to zero (Admin only)')
                .addUserOption(option => 
                    option.setName('user')
                        .setDescription('The user to reset XP for')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for resetting the level')
                        .setRequired(false)
                )
                .addBooleanOption(option =>
                    option.setName('keepstats')
                    .setDescription('Keep message and voice time stats (default: false)')
                    .setRequired(false)
                )
        );
    }

    shouldDeferReply() {
        return true;
    }

    isEphemeral() {
        return true;
    }

    async validateInput(interaction) {
        // Check if the user has permission to use this command (admins only)
        const hasPermission = await checkModerationPermission(interaction, 'admins');
        if (!hasPermission) {
            throw createValidationError('You do not have permission to use this command. Only Admins can reset user levels.');
        }

        // Get the options to validate
        const targetUser = interaction.options.getUser('user');

        // Don't allow resetting level for bots
        if (targetUser.bot) {
            throw createValidationError('You cannot reset levels for bots.');
        }

        return true;
    }

    async executeCommand(interaction) {
        try {
            // Get the options directly
            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const keepStats = interaction.options.getBoolean('keepstats') || false;
            
            // Find the user's XP record
            const userXP = await UserXP.findOne({
                userId: targetUser.id,
                guildId: interaction.guild.id
            });

            if (!userXP) {
                throw createValidationError(`${targetUser.toString()} has no XP record to reset.`);
            }

            // Store old values for logging
            const oldLevel = userXP.level;
            const oldXP = userXP.xp;

            // Reset XP and level
            userXP.xp = 0;
            userXP.level = 0;
            
            // Reset message and voice stats if not keeping them
            if (!keepStats) {
                userXP.messageCount = 0;
                userXP.voiceTimeMinutes = 0;
            }
            
            await userXP.save();

            // Remove level roles if any
            await this.removeLevelRoles(interaction, targetUser);

            // Log the action
            console.log(`[ResetLevel] ${interaction.user.tag} reset ${targetUser.tag}'s level from ${oldLevel} (XP: ${oldXP}) to 0. Reason: ${reason}`);

            return { targetUser, oldLevel, oldXP, reason, keepStats };
        } catch (error) {
            if (error.validationError) {
                throw error;
            }
            console.error('Error in resetlevel command:', error);
            throw createValidationError('An error occurred while resetting the level. Please try again later.');
        }
    }

    async removeLevelRoles(interaction, targetUser) {
        try {
            const member = await interaction.guild.members.fetch(targetUser.id);
            if (!member) return;

            const levelRoleIds = [
                '1066909132243865660', // Level 5
                '1066909130964611123', // Level 10
                '1066909129941192705', // Level 15
                '1066909500210151555'  // Level 25
            ];

            for (const roleId of levelRoleIds) {
                if (member.roles.cache.has(roleId)) {
                    await member.roles.remove(roleId);
                    console.log(`[ResetLevel] Removed role ${roleId} from ${member.user.tag}`);
                }
            }
        } catch (error) {
            console.error('Error removing level roles:', error);
        }
    }

    async sendResponse(interaction, { targetUser, oldLevel, oldXP, reason, keepStats }) {
        await interaction.editReply({
            content: `✅ Successfully reset ${targetUser.toString()}'s level from level ${oldLevel} (${oldXP} XP) to level 0.` +
                     `\nReason: ${reason}` +
                     `\nMessage & voice time stats were ${keepStats ? 'preserved' : 'reset'}.`
        });
    }

    shouldLogAction() {
        return true;
    }

    async logAction(interaction, { targetUser, oldLevel, oldXP, reason, keepStats }) {
        try {
            // Get the audit log channel
            const auditLogChannelId = process.env.AUDIT_LOG_CHANNEL_ID; 
            if (!auditLogChannelId) return;

            const channel = interaction.guild.channels.cache.get(auditLogChannelId);
            if (!channel) return;

            await channel.send({
                content: `📊 **Level Reset**\n` +
                         `**Moderator:** ${interaction.user.tag} (${interaction.user.id})\n` +
                         `**User:** ${targetUser.tag} (${targetUser.id})\n` +
                         `**Action:** Level reset from ${oldLevel} (${oldXP} XP) to 0\n` +
                         `**Stats Preserved:** ${keepStats ? 'Yes' : 'No'}\n` +
                         `**Reason:** ${reason}`
            });
        } catch (error) {
            console.error('Error logging resetlevel action:', error);
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

module.exports = new ResetLevelCommand();
