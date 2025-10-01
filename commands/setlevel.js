const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const UserXP = require('../models/UserXP');
const { BaseCommand } = require('../utils/commandTemplate');
const { createValidationError } = require('../utils/errorHandler');
const { checkModerationPermission } = require('../utils/commandHelpers');
const { getXPForLevel, assignLevelRoles } = require('../services/xpService');

class SetLevelCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('setlevel')
                .setDescription('Set a user\'s level (Admin only)')
                .addUserOption(option => 
                    option.setName('user')
                        .setDescription('The user to set level for')
                        .setRequired(true)
                )
                .addIntegerOption(option => 
                    option.setName('level')
                        .setDescription('The level to set')
                        .setRequired(true)
                        .setMinValue(1)
                )
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for changing the level')
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
            throw createValidationError('You do not have permission to use this command. Only Admins can set user levels.');
        }

        // Get the options to validate them
        const targetUser = interaction.options.getUser('user');
        const level = interaction.options.getInteger('level');

        // Don't allow setting level for bots
        if (targetUser.bot) {
            throw createValidationError('You cannot set levels for bots.');
        }

        return true; // Return true instead of options object
    }

    async executeCommand(interaction) {
        try {
            // Get the options directly in this method
            const targetUser = interaction.options.getUser('user');
            const level = interaction.options.getInteger('level');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            // Convert level to XP using the formula
            const xp = getXPForLevel(level);
            
            // Find or create user XP record
            let userXP = await UserXP.findOne({
                userId: targetUser.id,
                guildId: interaction.guild.id
            });

            if (!userXP) {
                userXP = new UserXP({
                    userId: targetUser.id,
                    guildId: interaction.guild.id,
                    xp: 0,
                    level: 0,
                    messageCount: 0,
                    voiceTimeMinutes: 0
                });
            }

            // Update XP and level
            const oldLevel = userXP.level;
            userXP.xp = xp;
            userXP.level = level;
            await userXP.save();

            // Assign appropriate level roles
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (member) {
                await assignLevelRoles(member, level);
                console.log(`[SetLevel] Updated roles for ${targetUser.tag} to match level ${level}`);
            }

            // Log the action
            console.log(`[SetLevel] ${interaction.user.tag} set ${targetUser.tag}'s level from ${oldLevel} to ${level} (XP: ${xp}). Reason: ${reason}`);

            return { targetUser, oldLevel, newLevel: level, xp, reason };
        } catch (error) {
            console.error('Error in setlevel command:', error);
            throw createValidationError('An error occurred while setting the level. Please try again later.');
        }
    }

    async sendResponse(interaction, { targetUser, oldLevel, newLevel, xp, reason }) {
        await interaction.editReply({
            content: `✅ Successfully ${oldLevel < newLevel ? 'promoted' : 'demoted'} ${targetUser.toString()} from level ${oldLevel} to level ${newLevel} (${xp} XP). Reason: ${reason}`
        });
    }

    shouldLogAction() {
        return true;
    }

    async logAction(interaction, { targetUser, oldLevel, newLevel, reason }) {
        try {
            // Get the audit log channel
            const auditLogChannelId = process.env.AUDIT_LOG_CHANNEL_ID; 
            if (!auditLogChannelId) return;

            const channel = interaction.guild.channels.cache.get(auditLogChannelId);
            if (!channel) return;

            await channel.send({
                content: `📊 **Level Changed**\n**Moderator:** ${interaction.user.tag} (${interaction.user.id})\n**User:** ${targetUser.tag} (${targetUser.id})\n**Action:** Level changed from ${oldLevel} to ${newLevel}\n**Reason:** ${reason}`
            });
        } catch (error) {
            console.error('Error logging setlevel action:', error);
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

module.exports = new SetLevelCommand(); 
