const { ContextMenuCommandBuilder, ApplicationCommandType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { checkModerationPermission } = require('../utils/commandHelpers');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Reply with Bot')
        .setType(ApplicationCommandType.Message),
    
    async execute(interaction) {
        try {
            // Check if user has permission (staff only)
            if (!await checkModerationPermission(interaction, 'admins')) {
                return interaction.reply({ 
                    content: 'You do not have permission to use this feature. Only admins can reply with the bot.',
                    flags: ['Ephemeral']
                });
            }
            
            const targetMessage = interaction.targetMessage;
            
            // Create a modal for the reply content
            const modal = new ModalBuilder()
                .setCustomId(`reply-modal-${targetMessage.id}`)
                .setTitle('Reply with Bot');
                
            // Add a text input for the reply content
            const replyInput = new TextInputBuilder()
                .setCustomId('reply-content')
                .setLabel('Message to send as the bot')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Enter the message you want the bot to reply with...')
                .setRequired(true)
                .setMaxLength(2000);
                
            const firstActionRow = new ActionRowBuilder().addComponents(replyInput);
            modal.addComponents(firstActionRow);
            
            // Show the modal to the user
            await interaction.showModal(modal);
            
        } catch (error) {
            console.error('Error in Reply with Bot context menu:', error);
            if (!interaction.replied) {
                await interaction.reply({ 
                    content: 'An error occurred while processing your request.', 
                    flags: ['Ephemeral'] 
                });
            }
        }
    }
}; 
