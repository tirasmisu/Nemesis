const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

// Command framework
const { BaseCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorHandler');

// Helpers & services
const { checkModerationPermission } = require('../utils/commandHelpers');

// Channel configuration
const channelConfig = require('../config/channels');

class SetupNickRequestCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('setupnickrequest')
                .setDescription('Set up the nickname request system in the current channel')
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
        if (!await checkModerationPermission(interaction, 'admins')) {
            throw createValidationError('You do not have permission to use this command. Only admins can set up the nickname request system.');
        }
        
        return { channel: interaction.channel };
    }

    async executeCommand(interaction) {
        const { channel } = await this.validateInput(interaction);
        
        // Create a button for submitting a nickname request
        const button = new ButtonBuilder()
            .setCustomId('request_nickname')
            .setLabel('Click here to request a nickname change!')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        // Create the embed for the nickname request system
        const embed = new EmbedBuilder()
            .setColor(0xFFD700) // Yellow color for the embed side
            .setTitle('Request a Nickname Change')
            .setDescription(`
Want to change your nickname? Click the button below to submit a request.

**Things to keep in mind:**
○ Ensure your nickname follows server rules.
○ Nickname requests are subject to approval by staff.
○ Abuse of this system may result in action against your account.
            `)
            .setThumbnail(interaction.client.user.displayAvatarURL()) // Set the bot's avatar as the thumbnail
            .setFooter({ text: "Discord.gg/Tranium | Nickname change requests are reviewed by staff.", iconURL: interaction.client.user.displayAvatarURL() }); // Custom footer with icon

        // Send the embed with the button (visible to everyone)
        const sentMessage = await channel.send({
            embeds: [embed],
            components: [row],
        });
        
        return { 
            channel,
            sentMessage,
            moderator: interaction.user
        };
    }

    async sendResponse(interaction, result) {
        await interaction.deleteReply();
    }

    async logAction(interaction, result) {
        const { channel, moderator } = result;
        
        // Create moderation embed
        const embed = new EmbedBuilder()
            .setColor(0x00FF00) // Green for successful setup
            .setDescription(`### **Moderation Log**`)
            .addFields(
                { name: "🔧 System Setup", value: `Nickname request system was set up in ${channel}`, inline: false },
                { name: "Administrator", value: `<@${moderator.id}>`, inline: true },
                { name: "Time", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
            )
            .setTimestamp();

        // Get log channel from config and send the embed
        const logChannelId = channelConfig.getId('SERVER_LOG');
        const logChannel = interaction.guild.channels.cache.get(logChannelId);
        
        if (logChannel) {
            await logChannel.send({ embeds: [embed] });
        }
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

module.exports = new SetupNickRequestCommand();
