const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Command framework
const { BaseCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorHandler');

// Helpers & services
const { checkModerationPermission } = require('../utils/commandHelpers');

// Channel configuration
const channelConfig = require('../config/channels');

class SayEmbedCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('sayembed')
                .setDescription('Make the bot send an embed with a description')
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('The title of the embed')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('The description of the embed (supports markdown and line breaks)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('color')
                        .setDescription('The color of the embed (hex code like #ff0000 or color names like red)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('image')
                        .setDescription('URL of an image to display in the embed')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('thumbnail')
                        .setDescription('URL of a thumbnail image to display in the embed')
                        .setRequired(false))
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
        
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const color = interaction.options.getString('color');
        const image = interaction.options.getString('image');
        const thumbnail = interaction.options.getString('thumbnail');
        
        if (!title || !description) {
            throw createValidationError('Title and description are required');
        }
        
        // Validate color if provided
        if (color && !this.isValidColor(color)) {
            throw createValidationError('Invalid color format. Use hex codes (e.g., #ff0000) or color names (e.g., red, blue, green)');
        }
        
        // Validate URLs if provided
        if (image && !this.isValidURL(image)) {
            throw createValidationError('Invalid image URL format');
        }
        
        if (thumbnail && !this.isValidURL(thumbnail)) {
            throw createValidationError('Invalid thumbnail URL format');
        }
        
        return { title, description, color, image, thumbnail };
    }

    isValidColor(color) {
        // Check if it's a hex color
        if (color.match(/^#[0-9A-F]{6}$/i)) {
            return true;
        }
        
        // Check if it's a valid color name
        const validColors = [
            'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'cyan', 
            'magenta', 'lime', 'indigo', 'violet', 'gold', 'silver', 'black', 'white'
        ];
        
        return validColors.includes(color.toLowerCase());
    }

    isValidURL(url) {
        try {
            new URL(url);
            return true;
        } catch (e) {
            return false;
        }
    }

    convertColorToHex(color) {
        if (color.startsWith('#')) {
            return color;
        }
        
        const colorMap = {
            'red': '#FF0000',
            'green': '#00FF00',
            'blue': '#0000FF',
            'yellow': '#FFFF00',
            'orange': '#FFA500',
            'purple': '#800080',
            'pink': '#FFC0CB',
            'cyan': '#00FFFF',
            'magenta': '#FF00FF',
            'lime': '#00FF00',
            'indigo': '#4B0082',
            'violet': '#8B00FF',
            'gold': '#FFD700',
            'silver': '#C0C0C0',
            'black': '#000000',
            'white': '#FFFFFF'
        };
        
        return colorMap[color.toLowerCase()] || '#0099FF'; // Default to blue if not found
    }

    async executeCommand(interaction) {
        const { title, description, color, image, thumbnail } = await this.validateInput(interaction);
        
        // Process description to convert \n to actual line breaks
        const processedDescription = description.replace(/\\n/g, '\n');
        
        // Create the embed
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(processedDescription)
            .setTimestamp();
        
        // Set color if provided
        if (color) {
            embed.setColor(this.convertColorToHex(color));
        } else {
            embed.setColor('#0099FF'); // Default blue color
        }
        
        // Set image if provided
        if (image) {
            embed.setImage(image);
        }
        
        // Set thumbnail if provided
        if (thumbnail) {
            embed.setThumbnail(thumbnail);
        }
        
        // Send the embed to the channel
        await interaction.channel.send({ embeds: [embed] });
        
        return { 
            title,
            description,
            color,
            image,
            thumbnail,
            channel: interaction.channel,
            moderator: interaction.user
        };
    }

    async sendResponse(interaction, result) {
        let responseMessage = `Embed sent successfully!\n\n**Title:** ${result.title}\n**Description:** ${result.description.length > 100 ? result.description.substring(0, 100) + '...' : result.description}`;
        
        if (result.color) {
            responseMessage += `\n**Color:** ${result.color}`;
        }
        
        if (result.image) {
            responseMessage += `\n**Image:** ${result.image}`;
        }
        
        if (result.thumbnail) {
            responseMessage += `\n**Thumbnail:** ${result.thumbnail}`;
        }
        
        await interaction.followUp({
            content: responseMessage,
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
                await interaction.editReply({ content: `Error: ${error.message}` });
            } else if (!interaction.replied) {
                await interaction.reply({ content: `Error: ${error.message}`, flags: ['Ephemeral'] });
            }
        }
    }
}

module.exports = new SayEmbedCommand(); 