const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const roleAuditor = require('../utils/roleAuditor');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('auditroles')
        .setDescription('Audit server roles - check muted roles and temporary "no" roles for expiration')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

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
    },

    async validateInput(interaction) {
        // Check if user has permission to use this command
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            await interaction.followUp({
                content: '❌ You need the "Moderate Members" permission to use this command.',
                flags: ['Ephemeral']
            });
            return false;
        }
        return true;
    },

    async executeCommand(interaction) {
        await interaction.editReply({
            content: '🔍 **Starting Role Audit...**\n\nChecking for:\n• Expired muted roles\n• Expired "No" roles (No VCs, No Tickets, etc.)\n\nThis may take a moment...'
        });

        // Run the audit
        await roleAuditor.auditAllRoles(interaction.client, interaction.guild.id);

        await interaction.editReply({
            content: '✅ **Role audit completed!**\n\nCheck the moderation log channel for the detailed audit report.'
        });

        // Log the command usage
        await logger.command(
            interaction.user.id,
            interaction.user.username,
            'auditroles',
            interaction.guild.id,
            true
        );

        return true;
    },

    async sendResponse(interaction, result) {
        // This method is empty as the response is handled in executeCommand
    }
}; 
