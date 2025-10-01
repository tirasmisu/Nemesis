const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

// Create confirmation dialog
async function createConfirmationDialog(interaction, options) {
    const {
        title = 'Confirmation Required',
        description,
        confirmLabel = 'Confirm',
        cancelLabel = 'Cancel',
        confirmColor = ButtonStyle.Danger,
        cancelColor = ButtonStyle.Secondary,
        timeout = 30000
    } = options;
    
    const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();
    
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('confirm')
                .setLabel(confirmLabel)
                .setStyle(confirmColor),
            new ButtonBuilder()
                .setCustomId('cancel')
                .setLabel(cancelLabel)
                .setStyle(cancelColor)
        );
    
    const message = await interaction.reply({
        embeds: [embed],
        components: [row],
        flags: ['Ephemeral']
    });
    
    try {
        const confirmation = await message.awaitMessageComponent({
            filter: i => i.user.id === interaction.user.id,
            time: timeout
        });
        
        if (confirmation.customId === 'confirm') {
            await confirmation.update({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setTitle('Confirmed')
                        .setDescription('Action has been confirmed.')
                ],
                components: []
            });
            return true;
        } else {
            await confirmation.update({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('Cancelled')
                        .setDescription('Action has been cancelled.')
                ],
                components: []
            });
            return false;
        }
    } catch (error) {
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('Timed Out')
                    .setDescription('Confirmation timed out. Please try again.')
            ],
            components: []
        });
        return false;
    }
}

// Create progress indicator
async function createProgressIndicator(interaction, options) {
    const {
        title = 'Processing',
        description = 'Please wait while we process your request...',
        totalSteps = 1,
        updateInterval = 1000
    } = options;
    
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(title)
        .setDescription(description)
        .addFields(
            { name: 'Progress', value: '0%', inline: true },
            { name: 'Status', value: 'Initializing...', inline: true }
        )
        .setTimestamp();
    
    const message = await interaction.reply({
        embeds: [embed],
        flags: ['Ephemeral']
    });
    
    let currentStep = 0;
    const startTime = Date.now();
    
    const updateProgress = async (step, status) => {
        currentStep = step;
        const progress = Math.round((currentStep / totalSteps) * 100);
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
        
        const updatedEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(title)
            .setDescription(description)
            .addFields(
                { name: 'Progress', value: `${progress}%`, inline: true },
                { name: 'Status', value: status, inline: true },
                { name: 'Elapsed Time', value: `${elapsedTime}s`, inline: true }
            )
            .setTimestamp();
        
        await interaction.editReply({
            embeds: [updatedEmbed]
        });
    };
    
    const complete = async (finalStatus) => {
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        
        const finalEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Complete')
            .setDescription(finalStatus || 'Operation completed successfully.')
            .addFields(
                { name: 'Total Time', value: `${totalTime}s`, inline: true }
            )
            .setTimestamp();
        
        await interaction.editReply({
            embeds: [finalEmbed]
        });
    };
    
    const error = async (errorMessage) => {
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('Error')
            .setDescription(errorMessage || 'An error occurred during the operation.')
            .addFields(
                { name: 'Time Elapsed', value: `${totalTime}s`, inline: true }
            )
            .setTimestamp();
        
        await interaction.editReply({
            embeds: [errorEmbed]
        });
    };
    
    return {
        updateProgress,
        complete,
        error
    };
}

// Create paginated embed
async function createPaginatedEmbed(interaction, options) {
    const {
        title,
        items,
        itemsPerPage = 10,
        formatItem = (item) => item.toString(),
        timeout = 300000
    } = options;
    
    const pages = [];
    for (let i = 0; i < items.length; i += itemsPerPage) {
        const pageItems = items.slice(i, i + itemsPerPage);
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(title)
            .setDescription(pageItems.map(formatItem).join('\n'))
            .setFooter({ text: `Page ${Math.floor(i / itemsPerPage) + 1} of ${Math.ceil(items.length / itemsPerPage)}` })
            .setTimestamp();
        pages.push(embed);
    }
    
    let currentPage = 0;
    
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('first')
                .setLabel('⏮️')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('prev')
                .setLabel('◀️')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('next')
                .setLabel('▶️')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('last')
                .setLabel('⏭️')
                .setStyle(ButtonStyle.Primary)
        );
    
    const message = await interaction.reply({
        embeds: [pages[currentPage]],
        components: [row],
        flags: ['Ephemeral']
    });
    
    const collector = message.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id,
        time: timeout
    });
    
    collector.on('collect', async (i) => {
        switch (i.customId) {
            case 'first':
                currentPage = 0;
                break;
            case 'prev':
                currentPage = Math.max(0, currentPage - 1);
                break;
            case 'next':
                currentPage = Math.min(pages.length - 1, currentPage + 1);
                break;
            case 'last':
                currentPage = pages.length - 1;
                break;
        }
        
        await i.update({
            embeds: [pages[currentPage]],
            components: [row]
        });
    });
    
    collector.on('end', async () => {
        await interaction.editReply({
            components: []
        });
    });
}

/**
 * Send an ephemeral reply to an interaction using recommended flags approach
 * @param {Interaction} interaction - The Discord interaction to reply to
 * @param {Object} options - Reply options (content, embeds, etc)
 * @param {boolean} forceReply - If true, will attempt to followUp if already replied
 * @returns {Promise} The reply result
 */
async function sendEphemeralReply(interaction, options, forceReply = false) {
    // Convert options to use flags instead of ephemeral
    const replyOptions = {
        ...options,
        flags: ['Ephemeral']
    };
    
    // Remove any ephemeral property if it exists
    if (replyOptions.ephemeral !== undefined) {
        delete replyOptions.ephemeral;
    }
    
    try {
        // Check if interaction has already been replied to
        if (interaction.replied || interaction.deferred) {
            if (forceReply) {
                return await interaction.followUp(replyOptions);
            }
        } else {
            return await interaction.reply(replyOptions);
        }
    } catch (error) {
        console.error('Error sending ephemeral reply:', error);
    }
}

module.exports = {
    createConfirmationDialog,
    createProgressIndicator,
    createPaginatedEmbed,
    sendEphemeralReply
}; 
