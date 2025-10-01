const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { cleanupExpiredMutes } = require('../utils/muteManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cleanupexpiredmutes')
        .setDescription('Manually clean up expired mutes that auto-unmute missed')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            const cleanedCount = await cleanupExpiredMutes(interaction.client);
            await interaction.editReply(`✅ Cleanup complete! Processed ${cleanedCount} expired mutes.`);
        } catch (error) {
            console.error('Error in cleanup command:', error);
            await interaction.editReply('❌ Error occurred during cleanup. Check console for details.');
        }
    }
}; 