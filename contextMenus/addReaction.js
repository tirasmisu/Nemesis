const { ContextMenuCommandBuilder, ApplicationCommandType, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, TextInputBuilder, ModalBuilder, TextInputStyle } = require('discord.js');
const { checkModerationPermission } = require('../utils/commandHelpers');

// Common emojis that will be available as quick-select options
const COMMON_EMOJIS = [
    { emoji: '👍', name: 'thumbs up' },
    { emoji: '👎', name: 'thumbs down' },
    { emoji: '❤️', name: 'heart' },
    { emoji: '🔥', name: 'fire' },
    { emoji: '💀', name: 'skull' },
    { emoji: '😂', name: 'joy' },
    { emoji: '🎉', name: 'party' },
    { emoji: '🙏', name: 'pray' },
    { emoji: '👀', name: 'eyes' }
];

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Add Reaction with Bot')
        .setType(ApplicationCommandType.Message),
    
    async execute(interaction) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ flags: ['Ephemeral'] });
            }
            // Check if user has permission (staff only)
            if (!await checkModerationPermission(interaction, 'admins')) {
                return await interaction.editReply({ 
                    content: 'You do not have permission to use this feature. Only admins can add reactions with the bot.',
                    flags: ['Ephemeral']
                });
            }
            
            const targetMessage = interaction.targetMessage;
            const messageId = targetMessage.id;
            
            // Create buttons for common emojis
            const rows = [];
            let currentRow = new ActionRowBuilder();
            let buttonCount = 0;
            
            // Add common emoji buttons
            for (const emojiData of COMMON_EMOJIS) {
                // Create new row every 5 buttons (Discord limit)
                if (buttonCount > 0 && buttonCount % 5 === 0) {
                    rows.push(currentRow);
                    currentRow = new ActionRowBuilder();
                }
                
                currentRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`react-${messageId}-${emojiData.emoji}`)
                        .setLabel(emojiData.emoji)
                        .setStyle(ButtonStyle.Secondary)
                );
                
                buttonCount++;
            }
            
            // Add the last row if it has components
            if (currentRow.components.length > 0) {
                rows.push(currentRow);
            }
            
            // Add a row with the custom emoji button
            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`custom-emoji-${messageId}`)
                    .setLabel('Add Custom Emoji')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`done-${messageId}`)
                    .setLabel('Done')
                    .setStyle(ButtonStyle.Success)
            );
            
            rows.push(actionRow);
            
            // Send the ephemeral message with emoji buttons
            await interaction.editReply({
                content: `Select emoji reactions to add to the message or click "Add Custom Emoji" to enter a custom one:\n[Jump to message](${targetMessage.url})`,
                components: rows,
                flags: ['Ephemeral']
            });
            
            // Create a collector for button interactions
            const collector = interaction.channel.createMessageComponentCollector({
                filter: i => {
                    return i.user.id === interaction.user.id && 
                          (i.customId.startsWith(`react-${messageId}`) || 
                           i.customId === `custom-emoji-${messageId}` ||
                           i.customId === `done-${messageId}`);
                },
                time: 60000 // 1 minute timeout
            });
            
            // Track which emojis have been added
            const addedEmojis = new Set();
            
            // Handle button clicks
            collector.on('collect', async (i) => {
                try {
                    // Handle "Done" button
                    if (i.customId === `done-${messageId}`) {
                        try {
                            await i.deferUpdate().catch(() => {});
                            collector.stop('done');
                        } catch (error) {
                            console.error('Error handling done button:', error);
                        }
                        return;
                    }
                    
                    // Handle "Custom Emoji" button
                    if (i.customId === `custom-emoji-${messageId}`) {
                        try {
                            // Create modal for custom emoji input
                            const modal = new ModalBuilder()
                                .setCustomId(`emoji-modal-${messageId}`)
                                .setTitle('Add Custom Emoji');
                            
                            const emojiInput = new TextInputBuilder()
                                .setCustomId('custom-emoji')
                                .setLabel('Paste emoji (unicode or Discord custom)')
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder('Enter a single emoji or Discord custom emoji')
                                .setRequired(true);
                            
                            const actionRow = new ActionRowBuilder().addComponents(emojiInput);
                            modal.addComponents(actionRow);
                            
                            // Show the modal
                            await i.showModal(modal).catch(err => {
                                console.error('Error showing modal:', err);
                            });
                        } catch (error) {
                            console.error('Error setting up custom emoji modal:', error);
                        }
                        
                        // Don't use awaitModalSubmit here - modal submissions are handled separately
                        // by the interactionCreate event, using the customId
                        return;
                    }
                    
                    // Handle emoji button
                    if (i.customId.startsWith(`react-${messageId}`)) {
                        try {
                            await i.deferUpdate().catch(() => {});
                            
                            // Extract the emoji from the button custom ID
                            const emoji = i.customId.replace(`react-${messageId}-`, '');
                            
                            try {
                                await targetMessage.react(emoji);
                                addedEmojis.add(emoji);
                                
                                // Send ephemeral feedback
                                await interaction.followUp({
                                    content: `Added reaction: ${emoji}`,
                                    flags: ['Ephemeral']
                                }).catch(err => {
                                    console.error('Error sending reaction feedback:', err);
                                });
                            } catch (error) {
                                console.error(`Error adding reaction ${emoji}:`, error);
                                await interaction.followUp({
                                    content: `Failed to add reaction: ${emoji}`,
                                    flags: ['Ephemeral']
                                }).catch(err => {
                                    console.error('Error sending reaction failure message:', err);
                                });
                            }
                        } catch (error) {
                            console.error('Error handling emoji button:', error);
                        }
                    }
                } catch (err) {
                    console.error('Error handling button interaction:', err);
                }
            });
            
            // When the collector ends
            collector.on('end', async (collected, reason) => {
                try {
                    // Send a summary
                    let content = '';
                    
                    if (addedEmojis.size === 0) {
                        content = 'No reactions were added to the message.';
                    } else {
                        const emojiList = Array.from(addedEmojis).join(' ');
                        content = `Added ${addedEmojis.size} reaction(s) to the message: ${emojiList}`;
                    }
                    
                    // Disable all buttons
                    for (const row of rows) {
                        for (const component of row.components) {
                            component.setDisabled(true);
                        }
                    }
                    
                    // Update the original message to disable buttons
                    await interaction.editReply({
                        content,
                        components: rows
                    }).catch(err => {
                        console.error('Error updating reaction summary:', err);
                    });
                } catch (err) {
                    console.error('Error ending collector:', err);
                }
            });
        } catch (error) {
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ content: 'An error occurred while processing your request.' });
            } else if (!interaction.replied) {
                await interaction.reply({ content: 'An error occurred while processing your request.', flags: ['Ephemeral'] });
            }
        }
    }
}; 
