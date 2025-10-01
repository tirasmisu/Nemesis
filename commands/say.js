const { SlashCommandBuilder } = require('discord.js');

// Command framework
const { BaseCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorHandler');

// Helpers & services
const { checkModerationPermission } = require('../utils/commandHelpers');

// Channel configuration
const channelConfig = require('../config/channels');

class SayCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('say')
                .setDescription('Make the bot say something in this channel')
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('The message you want the bot to say')
                        .setRequired(true))
        );
    }

    shouldDeferReply() {
        return true;
    }

    isEphemeral() {
        return true;
    }

    async validateInput(interaction) {
        if (!await checkModerationPermission(interaction, 'admins')) {
            throw createValidationError('You do not have permission to use this command. Only admins can use it.');
        }
        
        const message = interaction.options.getString('message');
        if (!message) {
            throw createValidationError('Message is required');
        }
        
        return { message };
    }

    async executeCommand(interaction) {
        const { message } = await this.validateInput(interaction);
        
        // Send the message to the channel
        await interaction.channel.send(message);
        
        return { 
            message,
            channel: interaction.channel,
            moderator: interaction.user
        };
    }

    async sendResponse(interaction, result) {
        await interaction.followUp({
            content: "Message sent!",
            flags: ['Ephemeral']
        });
    }

    async execute(interaction) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ flags: ['Ephemeral'] });
            }
            const validation = await this.validateInput(interaction);
            if (!validation) return;
            const result = await this.executeCommand(interaction);
            await this.sendResponse(interaction, result);
        } catch (error) {
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ content: 'An error occurred while processing your request.' });
            } else if (!interaction.replied) {
                await interaction.reply({ content: 'An error occurred while processing your request.', flags: ['Ephemeral'] });
            }
        }
    }
}

module.exports = new SayCommand();
