const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

// Command framework
const { BaseCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorHandler');

// Helper utilities
const { canRequestNickname, updateNicknameCooldown } = require('../utils/nicknameHelper');

class NicknameCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('nickname')
                .setDescription('Request a nickname change')
        );
    }

    async validateInput(interaction) {
        // Check cooldown and pending requests
        const cooldownCheck = await canRequestNickname(interaction.user.id, interaction.guild);
        if (!cooldownCheck.allowed) {
            // Send the response directly and return false
            await interaction.reply({
                content: cooldownCheck.message,
                flags: ['Ephemeral']
            });
            return false;
        }

        return true;
    }

    async executeCommand(interaction) {
        // Validation is already handled in validateInput, so we can proceed directly
        
        // Create a modal for nickname submission (same as the server button)
        const modal = new ModalBuilder()
            .setCustomId('nickname_modal')
            .setTitle('Request Nickname Change');

        const nicknameInput = new TextInputBuilder()
            .setCustomId('nickname_input')
            .setLabel('Enter your desired nickname')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(32);

        const reasonInput = new TextInputBuilder()
            .setCustomId('reason_input')
            .setLabel('Why do you want this nickname?')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500);

        const nicknameRow = new ActionRowBuilder().addComponents(nicknameInput);
        const reasonRow = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(nicknameRow, reasonRow);

        await interaction.showModal(modal);
        
        return { modalShown: true };
    }
}

module.exports = new NicknameCommand(); 
