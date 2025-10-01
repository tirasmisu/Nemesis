const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Command framework
const { BaseCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorHandler');

// Helpers & services
const { checkModerationPermission } = require('../utils/commandHelpers');
const { generateUniquePunishmentId } = require('../utils/generatePunishmentId');

// Channel configuration
const channelConfig = require('../config/channels');

// Database model
const WhitelistWord = require('../models/WhitelistWord');

// Whitelist helper for cache management
const blacklistHelper = require('../utils/blacklistHelper');

class UnwhitelistWordCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('unwhitelistword')
                .setDescription('Remove a word from the whitelist')
                .addStringOption(option =>
                    option.setName('word')
                          .setDescription('The word to remove from whitelist')
                          .setRequired(true)
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
        return true;
    }

    async validateInput(interaction) {
        if (!await checkModerationPermission(interaction, 'SENIOR_MODERATORS')) {
            throw createValidationError('You do not have permission to use this command.');
        }
        
        const raw = interaction.options.getString('word');
        if (!raw) {
            throw createValidationError('Word is required.');
        }
        
        const word = raw.toLowerCase().trim();
        
        // Allow alphanumeric characters, spaces, hyphens, apostrophes, and periods
        if (!/^[a-zA-Z0-9\s\-\'\.]+$/.test(word)) {
            console.log(`[UNWHITELISTWORD] Invalid word format: "${word}"`);
            throw createValidationError('Words must only contain alphanumeric characters, spaces, hyphens, apostrophes, and periods.');
        }
        
        return { word };
    }

    async executeCommand(interaction) {
        const { word } = await this.validateInput(interaction);
        
        // Check if word exists in database
        const existingWord = await WhitelistWord.findOne({ word: word.toLowerCase() });
        if (!existingWord) {
            return { 
                error: true,
                message: `The word "${word}" is not in the whitelist.`
            };
        }
        
        // Remove word from database
        await WhitelistWord.deleteOne({ word: word.toLowerCase() });
        console.log(`[UNWHITELISTWORD] Removed "${word}" from database whitelist`);
        
        // Refresh the cache
        await blacklistHelper.refreshCache();
        
        const punishmentId = await generateUniquePunishmentId();
        
        return { 
            word, 
            punishmentId,
            moderator: interaction.user,
            success: true,
            originalReason: existingWord.reason
        };
    }

    async sendResponse(interaction, result) {
        let message;
        
        if (result.error) {
            message = result.message;
        } else {
            message = `The word "${result.word}" has been removed from the whitelist.`;
        }
        
        try {
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({
                    content: message
                });
            } else if (!interaction.replied) {
                await interaction.reply({
                    content: message,
                    flags: ['Ephemeral']
                });
            } else {
                // Interaction already handled, just log success
                console.log(`[UNWHITELISTWORD] Response: ${message}`);
            }
        } catch (error) {
            // If response fails, still log the success since database operation worked
            console.log(`[UNWHITELISTWORD] Response failed but operation succeeded: ${message}`);
            console.log(`[UNWHITELISTWORD] Error: ${error.message}`);
        }
    }
    
    async logAction(interaction, result) {
        // Only log successful actions
        if (result.error || !result.success) {
            return;
        }
        
        const { word, originalReason, punishmentId, moderator } = result;
        
        // Create moderation embed
        const embed = new EmbedBuilder()
            .setColor(0xFF8800) // Orange
            .setDescription(`### **Moderation Log**`)
            .setFooter({ text: `Punishment ID: ${punishmentId}` })
            .addFields(
                { name: "🗑️ Word Removed from Whitelist", value: `Word: \`${word}\`\nOriginal Reason: ${originalReason}`, inline: false },
                { name: "Moderator", value: `<@${moderator.id}>`, inline: true }
            )
            .setTimestamp();

        // Get log channel from config and send the embed
        const logChannelId = channelConfig.getId('SERVER_LOG');
        const logChannel = interaction.guild.channels.cache.get(logChannelId);
        
        if (logChannel) {
            await logChannel.send({ embeds: [embed] });
        }
    }
}

module.exports = new UnwhitelistWordCommand(); 