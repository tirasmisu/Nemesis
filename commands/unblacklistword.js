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
const BlacklistWord = require('../models/BlacklistWord');

// Blacklist helper for cache management
const blacklistHelper = require('../utils/blacklistHelper');

class UnblacklistWordCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('unblacklistword')
                .setDescription('Remove a word from the blacklist')
                .addStringOption(option =>
                    option.setName('word')
                          .setDescription('The word to remove from the blacklist')
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
            console.log(`[UNBLACKLISTWORD] Invalid word format: "${word}"`);
            throw createValidationError('Words must only contain alphanumeric characters, spaces, hyphens, apostrophes, and periods.');
        }
        
        return { word };
    }

    async executeCommand(interaction) {
        const { word } = await this.validateInput(interaction);
        
        // Check if word exists in database
        const existingWord = await BlacklistWord.findOne({ word: word.toLowerCase() });
        if (!existingWord) {
            return { 
                error: true,
                message: `The word "${word}" is not in the blacklist.`
            };
        }
        
        // Remove word from database
        await BlacklistWord.deleteOne({ word: word.toLowerCase() });
        console.log(`[UNBLACKLISTWORD] Removed "${word}" from database blacklist`);
        
        // Refresh the blacklist cache
        await blacklistHelper.refreshCache();
        
        const punishmentId = await generateUniquePunishmentId();
        
        return { 
            word, 
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
            message = `The word "${result.word}" has been removed from the blacklist.`;
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
                console.log(`[UNBLACKLISTWORD] Response: ${message}`);
            }
        } catch (error) {
            // If response fails, still log the success since database operation worked
            console.log(`[UNBLACKLISTWORD] Response failed but operation succeeded: ${message}`);
            console.log(`[UNBLACKLISTWORD] Error: ${error.message}`);
        }
    }
    
    async logAction(interaction, result) {
        // Only log successful actions
        if (result.error || !result.success) {
            return;
        }
        
        const { word, punishmentId, moderator } = result;
        
        // Create moderation embed
        const embed = new EmbedBuilder()
            .setColor(0x32CD32) // Lime Green
            .setDescription(`### **Moderation Log**`)
            .setFooter({ text: `Punishment ID: ${punishmentId}` })
            .addFields(
                { name: "✅ Word Unblacklisted", value: `Word: \`${word}\``, inline: false },
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

module.exports = new UnblacklistWordCommand();
