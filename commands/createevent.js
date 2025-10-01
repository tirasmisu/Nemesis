const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { checkPermissions } = require('../utils/commandHelpers');
const channelManager = require('../utils/channelManager');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('createevent')
        .setDescription('Create a temporary event channel for YouTube content')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of event')
                .addChoices(
                    { name: '🔴 Live Stream', value: 'stream' },
                    { name: '🎬 Video Premiere', value: 'premiere' },
                    { name: '🎯 Special Event', value: 'event' }
                )
                .setRequired(true))
        .addStringOption(option =>
            option.setName('title')
                .setDescription('Title of the event')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Duration in hours (1-48)')
                .setMinValue(1)
                .setMaxValue(48)
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

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
    },

    async validateInput(interaction) {
        const hasPermission = await checkPermissions(interaction, ['admin', 'seniormod', 'mod']);
        if (!hasPermission) return false;

        const type = interaction.options.getString('type');
        const title = interaction.options.getString('title');
        const duration = interaction.options.getInteger('duration') || 6;

        if (duration < 1 || duration > 48) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Error')
                .setDescription('Duration must be between 1 and 48 hours.')
                .setTimestamp();
            await interaction.followUp({ embeds: [errorEmbed] });
            return false;
        }
        return true;
    },

    async executeCommand(interaction) {
        const type = interaction.options.getString('type');
        const title = interaction.options.getString('title');
        const duration = interaction.options.getInteger('duration') || 6;

        let channel;

        switch (type) {
            case 'stream':
                channel = await channelManager.createStreamChannel(interaction.guild, title);
                break;
            case 'premiere':
            case 'event':
                const durationMs = duration * 60 * 60 * 1000;
                channel = await channelManager.createEventChannel(interaction.guild, title, durationMs);
                break;
        }

        await logger.command(
            interaction.user.id,
            interaction.user.username,
            'createevent',
            interaction.guild.id,
            true
        );

        return { channel };
    },

    async sendResponse(interaction, result) {
        try {
            const { channel } = result;
            const type = interaction.options.getString('type');
            const title = interaction.options.getString('title');
            const duration = interaction.options.getInteger('duration') || 6;
            const confirmEmbed = new EmbedBuilder()
                .setColor('#00ff88')
                .setTitle('✅ Event Channel Created')
                .setDescription(`Successfully created ${channel} for **${title}**`)
                .addFields(
                    { name: 'Type', value: type, inline: true },
                    { name: 'Duration', value: type === 'stream' ? 'Until ended' : `${duration} hours`, inline: true }
                )
                .setTimestamp();
            await interaction.editReply({ embeds: [confirmEmbed] });
        } catch (error) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Error')
                .setDescription('Failed to create event channel.')
                .setTimestamp();
            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: ['Ephemeral'] });
            }
        }
    }
}; 
