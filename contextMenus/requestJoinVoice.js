const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const { createJoinRequest } = require('../services/joinRequestService');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Request to Join Voice Channel')
        .setType(ApplicationCommandType.User),
    
    async execute(interaction) {
        try {
            await interaction.deferReply({ flags: ['Ephemeral'] });
            
            const targetUser = interaction.targetUser;
            const targetMember = interaction.targetMember;
            
            // Basic validation
            if (!targetUser) {
                return interaction.editReply({
                    content: 'Could not find the user.'
                });
            }
            
            if (targetUser.id === interaction.user.id) {
                return interaction.editReply({
                    content: 'You cannot request to join your own voice channel.'
                });
            }
            
            if (targetUser.bot) {
                return interaction.editReply({
                    content: 'You cannot request to join a bot\'s voice channel.'
                });
            }
            
            if (!targetMember) {
                return interaction.editReply({
                    content: 'That user is not in this server.'
                });
            }
            
            // Create interactive join request
            const result = await createJoinRequest(interaction, targetUser.id);
            
            await interaction.editReply({
                content: result.message
            });
            
        } catch (error) {
            console.error('Error in Request to Join Voice Channel context menu:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred while processing your request.', 
                    flags: ['Ephemeral'] 
                });
            } else if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ 
                    content: 'An error occurred while processing your request.' 
                });
            }
        }
    }
}; 