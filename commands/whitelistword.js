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

class WhitelistWordCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('whitelistword')
                .setDescription('Add a word to the whitelist to allow it despite containing blacklisted substrings')
                .addStringOption(option =>
                    option.setName('word')
                          .setDescription('The word to whitelist')
                          .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('reason')
                          .setDescription('Reason for whitelisting this word')
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
        // This handles common words like "don't", "we're", "co-op", etc.
        if (!/^[a-zA-Z0-9\s\-\'\.]+$/.test(word)) {
            console.log(`[WHITELISTWORD] Invalid word format: "${word}"`);
            throw createValidationError('Words must only contain alphanumeric characters, spaces, hyphens, apostrophes, and periods.');
        }
        
        if (word.length > 30) {
            throw createValidationError('Words must be 30 characters or fewer.');
        }
        
        const reason = interaction.options.getString('reason') || 'Contains blacklisted substring but is legitimate';
        
        return { word, reason };
    }

    async executeCommand(interaction) {
        const { word, reason } = await this.validateInput(interaction);
        
        // Check if word already exists in database
        const existingWord = await WhitelistWord.findOne({ word: word.toLowerCase() });
        if (existingWord) {
            return { 
                error: true,
                message: `The word "${word}" is already in the whitelist.`
            };
        }
        
        const punishmentId = await generateUniquePunishmentId();
        
        // Add word to database
        const newWhitelistWord = new WhitelistWord({
            word: word.toLowerCase(),
            addedBy: interaction.user.id,
            punishmentId: punishmentId,
            reason: reason
        });
        
        await newWhitelistWord.save();
        console.log(`[WHITELISTWORD] Added "${word}" to database whitelist`);
        
        // Refresh the cache
        await blacklistHelper.refreshCache();
        
        return { 
            word, 
            reason,
            punishmentId,
            moderator: interaction.user,
            success: true
        };
    }

    async sendResponse(interaction, result) {
        let message;
        
        if (result.error) {
            message = result.message;
        } else {
            message = `The word "${result.word}" has been added to the whitelist.`;
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
                console.log(`[WHITELISTWORD] Response: ${message}`);
            }
        } catch (error) {
            // If response fails, still log the success since database operation worked
            console.log(`[WHITELISTWORD] Response failed but operation succeeded: ${message}`);
            console.log(`[WHITELISTWORD] Error: ${error.message}`);
        }
    }
    
    async logAction(interaction, result) {
        // Only log successful actions
        if (result.error || !result.success) {
            return;
        }
        
        const { word, reason, punishmentId, moderator } = result;
        
        // Create moderation embed
        const embed = new EmbedBuilder()
            .setColor(0x00FF00) // Green
            .setDescription(`### **Moderation Log**`)
            .setFooter({ text: `Punishment ID: ${punishmentId}` })
            .addFields(
                { name: "✅ Word Whitelisted", value: `Word: \`${word}\`\nReason: ${reason}`, inline: false },
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

module.exports = new WhitelistWordCommand(); 