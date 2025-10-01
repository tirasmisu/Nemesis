const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { BaseCommand } = require('../utils/commandTemplate');
const { createValidationError } = require('../utils/errorHandler');

class TranslateCommand extends BaseCommand {
    constructor() {
        super(new SlashCommandBuilder()
            .setName('translate')
            .setDescription('Translate text to another language')
            .addStringOption(option =>
                option.setName('text')
                    .setDescription('The text to translate')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('target')
                    .setDescription('Target language (e.g., en, es, fr, de, ja)')
                    .setRequired(false)));
                    
        this.category = 'utility';
        this.cooldown = 5;
    }

    shouldDeferReply() {
        return true;
    }

    isEphemeral() {
        return false;
    }

    async validateInput(interaction) {
        const text = interaction.options.getString('text');
        if (!text || text.trim().length === 0) {
            throw createValidationError('Please provide text to translate.');
        }
        return { text };
    }

    async executeCommand(interaction) {
        const text = interaction.options.getString('text');
        const targetLang = interaction.options.getString('target') || 'en';
        
        try {
            const translatedText = await interaction.client.translate(text, targetLang);
            
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`Translation to ${this.getLanguageName(targetLang)}`)
                .addFields(
                    { name: 'Original', value: text },
                    { name: `Translated (${this.getLanguageName(targetLang)})`, value: translatedText }
                )
                .setTimestamp();
                
            return { embed };
        } catch (error) {
            console.error('Translation error:', error);
            throw new Error('An error occurred while translating the text. Please check the target language is valid.');
        }
    }

    async sendResponse(interaction, result) {
        await interaction.followUp({ embeds: [result.embed] });
    }

    shouldLogAction() {
        return false;
    }
    
    getLanguageName(code) {
        const languages = {
            'en': 'English',
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German',
            'it': 'Italian',
            'pt': 'Portuguese',
            'nl': 'Dutch',
            'ru': 'Russian',
            'ja': 'Japanese',
            'ko': 'Korean',
            'zh': 'Chinese',
            'ar': 'Arabic',
            'hi': 'Hindi',
            'tr': 'Turkish'
        };
        
        return languages[code.toLowerCase()] || code;
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

module.exports = new TranslateCommand(); 
