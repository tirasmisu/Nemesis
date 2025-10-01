const { ContextMenuCommandBuilder, ApplicationCommandType, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Translate Message')
        .setType(ApplicationCommandType.Message),
    
    async execute(interaction) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ flags: ['Ephemeral'] });
            }
            
            const targetMessage = interaction.targetMessage;
            const messageContent = targetMessage.content;
            
            if (!messageContent || messageContent.trim().length === 0) {
                return await interaction.editReply({ 
                    content: 'This message has no text to translate.',
                    flags: ['Ephemeral']
                });
            }
            
            // Use the client's translate method
            const translatedText = await interaction.client.translate(messageContent, 'en');
            
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('Translation to English')
                .addFields(
                    { name: 'Original', value: messageContent },
                    { name: 'Translated (English)', value: translatedText }
                )
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ content: 'An error occurred while processing your request.' });
            } else if (!interaction.replied) {
                await interaction.reply({ content: 'An error occurred while processing your request.', flags: ['Ephemeral'] });
            }
        }
    }
}; 
