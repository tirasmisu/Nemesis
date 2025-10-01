const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Command framework
const { BaseCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorHandler');

// Helpers & services
const { checkModerationPermission } = require('../utils/commandHelpers');

// Channel configuration
const channelConfig = require('../config/channels');

// Database model
const BlacklistWord = require('../models/BlacklistWord');

class SendBlacklistCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('sendblacklist')
                .setDescription('View all blacklisted words from the database')
                .addIntegerOption(option =>
                    option.setName('page')
                        .setDescription('Page number to view (default: 1)')
                        .setMinValue(1)
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

    shouldLogAction() {
        return false;
    }

    async validateInput(interaction) {
        if (!await checkModerationPermission(interaction, 'helpers')) {
            throw createValidationError('You do not have permission to use this command.');
        }
        
        const page = interaction.options.getInteger('page') || 1;
        
        return { page };
    }

    async executeCommand(interaction) {
        const { page } = await this.validateInput(interaction);
        
        // Get total count of blacklisted words
        const totalWords = await BlacklistWord.countDocuments();
        
        if (totalWords === 0) {
            return {
                error: true,
                message: 'No blacklisted words found in the database.'
            };
        }
        
        // Pagination settings
        const wordsPerPage = 50;
        const totalPages = Math.ceil(totalWords / wordsPerPage);
        
        // Validate page number
        if (page > totalPages) {
            return {
                error: true,
                message: `Page ${page} does not exist. There are only ${totalPages} pages available.`
            };
        }
        
        // Calculate skip value for pagination
        const skip = (page - 1) * wordsPerPage;
        
        // Fetch words from database with pagination
        const words = await BlacklistWord.find({})
            .select('word addedBy addedAt')
            .sort({ addedAt: -1 }) // Most recent first
            .skip(skip)
            .limit(wordsPerPage)
            .lean();
        
        return {
            words,
            page,
            totalPages,
            totalWords,
            wordsPerPage,
            moderator: interaction.user
        };
    }

    async sendResponse(interaction, result) {
        if (result.error) {
            await interaction.editReply({
                content: result.message
            });
            return;
        }
        
        const { words, page, totalPages, totalWords, wordsPerPage } = result;
        
        // Create the embed
        const embed = new EmbedBuilder()
            .setColor(0xFF5555)
            .setTitle('🚫 Blacklisted Words Database')
            .setDescription(`Showing page ${page} of ${totalPages} (${totalWords} total words)`)
            .setTimestamp();
        
        // Group words into chunks for better readability
        const wordsPerField = 25;
        const fieldChunks = [];
        
        for (let i = 0; i < words.length; i += wordsPerField) {
            const chunk = words.slice(i, i + wordsPerField);
            fieldChunks.push(chunk);
        }
        
        // Add fields to embed
        fieldChunks.forEach((chunk, index) => {
            const wordList = chunk.map((wordDoc, wordIndex) => {
                const globalIndex = (page - 1) * wordsPerPage + (index * wordsPerField) + wordIndex + 1;
                return `${globalIndex}. \`${wordDoc.word}\``;
            }).join('\n');
            
            const fieldTitle = fieldChunks.length === 1 ? 'Words' : `Words (${index * wordsPerField + 1}-${Math.min((index + 1) * wordsPerField, chunk.length + index * wordsPerField)})`;
            
            embed.addFields({
                name: fieldTitle,
                value: wordList,
                inline: false
            });
        });
        
        // Add pagination info
        embed.setFooter({
            text: `Page ${page}/${totalPages} • Total: ${totalWords} words • Click buttons to navigate`
        });
        
        // Create navigation buttons if there are multiple pages
        let components = [];
        if (totalPages > 1) {
            const row = new ActionRowBuilder();
            
            // Previous page button
            if (page > 1) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`sendblacklist_page_${page - 1}`)
                        .setLabel('← Previous')
                        .setStyle(ButtonStyle.Secondary)
                );
            }
            
            // Page indicator
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('sendblacklist_current_page')
                    .setLabel(`${page}/${totalPages}`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true)
            );
            
            // Next page button
            if (page < totalPages) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`sendblacklist_page_${page + 1}`)
                        .setLabel('Next →')
                        .setStyle(ButtonStyle.Secondary)
                );
            }
            
            components = [row];
        }
        
        await interaction.editReply({
            embeds: [embed],
            components: components
        });
    }


}

module.exports = new SendBlacklistCommand();
