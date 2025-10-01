const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Command framework
const { BaseCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorHandler');

// Helpers & services
const { checkModerationPermission } = require('../utils/commandHelpers');

// Database model
const WhitelistWord = require('../models/WhitelistWord');

class SendWhitelistCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('sendwhitelist')
                .setDescription('Show the current whitelist with pagination')
                .addIntegerOption(option =>
                    option.setName('page')
                          .setDescription('Page number (default: 1)')
                          .setRequired(false)
                          .setMinValue(1)
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
        if (!await checkModerationPermission(interaction, 'SENIOR_MODERATORS')) {
            throw createValidationError('You do not have permission to use this command.');
        }
        
        const page = interaction.options.getInteger('page') || 1;
        return { page };
    }

    async executeCommand(interaction) {
        const { page } = await this.validateInput(interaction);
        
        // Get total count of whitelisted words
        const totalWords = await WhitelistWord.countDocuments();
        
        if (totalWords === 0) {
            return {
                error: true,
                message: 'No whitelisted words found in the database.'
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
        const words = await WhitelistWord.find({})
            .select('word addedBy addedAt reason')
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
            const message = result.message;
            try {
                if (interaction.deferred && !interaction.replied) {
                    await interaction.editReply({ content: message });
                } else if (!interaction.replied) {
                    await interaction.reply({ content: message, flags: ['Ephemeral'] });
                }
            } catch (error) {
                console.log(`[SENDWHITELIST] Response failed: ${error.message}`);
            }
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('📋 Whitelist')
            .setDescription(`**Total Words:** ${result.totalWords}\n**Page:** ${result.page} of ${result.totalPages}`)
            .setTimestamp();

        // Format words for display
        const wordList = result.words.map((word, index) => {
            const position = (result.page - 1) * result.wordsPerPage + index + 1;
            const addedDate = new Date(word.addedAt).toLocaleDateString();
            const addedBy = word.addedBy !== 'system' ? `<@${word.addedBy}>` : 'System';
            
            return `**${position}.** \`${word.word}\`\n   *Reason:* ${word.reason}\n   *Added by:* ${addedBy} on ${addedDate}`;
        }).join('\n\n');

        // Set the description with word list
        if (wordList.length <= 4000) {
            embed.setDescription(`**Total Words:** ${result.totalWords}\n**Page:** ${result.page} of ${result.totalPages}\n\n${wordList}`);
        } else {
            // If too long, truncate and add note
            const truncated = wordList.substring(0, 3900) + '\n\n*... (list truncated, use different page number)*';
            embed.setDescription(`**Total Words:** ${result.totalWords}\n**Page:** ${result.page} of ${result.totalPages}\n\n${truncated}`);
        }

        try {
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ embeds: [embed] });
            } else if (!interaction.replied) {
                await interaction.reply({ embeds: [embed], flags: ['Ephemeral'] });
            }
        } catch (error) {
            console.log(`[SENDWHITELIST] Response failed: ${error.message}`);
        }
    }
}

module.exports = new SendWhitelistCommand(); 