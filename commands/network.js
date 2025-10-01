const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const networkHealth = require('../utils/networkHealth');
const { checkModerationPermission } = require('../utils/commandHelpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('network')
        .setDescription('Check network connectivity and diagnose connection issues')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('What to check')
                .setRequired(false)
                .addChoices(
                    { name: 'Status', value: 'status' },
                    { name: 'Test Discord', value: 'test' },
                    { name: 'Full Report', value: 'report' }
                )),

    async execute(interaction) {
        try {
            // Check permissions - only allow staff to use this
            const hasPermission = await checkModerationPermission(interaction, ['TRIAL_HELPER']);
            if (!hasPermission) {
                return interaction.reply({
                    content: 'You do not have permission to use this command.',
                    flags: ['Ephemeral']
                });
            }

            const action = interaction.options.getString('action') || 'status';

            await interaction.deferReply({ ephemeral: true });

            let embed;
            switch (action) {
                case 'test':
                    embed = await this.testDiscordConnectivity();
                    break;
                case 'report':
                    embed = await this.generateFullReport();
                    break;
                default:
                    embed = await this.getNetworkStatus();
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in network command:', error);
            await interaction.editReply({
                content: 'An error occurred while checking network status.',
                flags: ['Ephemeral']
            });
        }
    },

    async testDiscordConnectivity() {
        const isReachable = await networkHealth.checkDiscordConnectivity();
        
        const embed = new EmbedBuilder()
            .setTitle('🌐 Discord Connectivity Test')
            .setColor(isReachable ? 0x00FF00 : 0xFF0000)
            .addFields(
                { name: 'Status', value: isReachable ? '✅ Connected' : '❌ Connection Failed', inline: true },
                { name: 'Timestamp', value: new Date().toLocaleString(), inline: true }
            );

        if (!isReachable) {
            embed.addFields(
                { name: 'Troubleshooting', value: '• Check your internet connection\n• Verify Discord servers are online\n• Try restarting the bot\n• Check firewall settings' }
            );
        }

        return embed;
    },

    async getNetworkStatus() {
        const info = await networkHealth.getNetworkInfo();
        
        const embed = new EmbedBuilder()
            .setTitle('🌐 Network Status')
            .setColor(0x0099FF)
            .addFields(
                { name: 'Discord Reachable', value: info.discordReachable ? '✅ Yes' : '❌ No', inline: true },
                { name: 'Bot Uptime', value: `${Math.floor(info.uptime / 3600)}h ${Math.floor((info.uptime % 3600) / 60)}m`, inline: true },
                { name: 'Memory Usage', value: `${Math.round(info.memoryUsage.heapUsed / 1024 / 1024)}MB`, inline: true }
            )
            .setTimestamp();

        return embed;
    },

    async generateFullReport() {
        const info = await networkHealth.getNetworkInfo();
        
        const embed = new EmbedBuilder()
            .setTitle('📊 Network Health Report')
            .setColor(0x0099FF)
            .addFields(
                { name: 'Discord Connectivity', value: info.discordReachable ? '✅ Healthy' : '❌ Issues Detected', inline: false },
                { name: 'Memory Usage', value: `Heap: ${Math.round(info.memoryUsage.heapUsed / 1024 / 1024)}MB\nRSS: ${Math.round(info.memoryUsage.rss / 1024 / 1024)}MB`, inline: true },
                { name: 'System Info', value: `Uptime: ${Math.floor(info.uptime / 3600)}h ${Math.floor((info.uptime % 3600) / 60)}m\nPlatform: ${process.platform}`, inline: true }
            )
            .setTimestamp();

        return embed;
    }
}; 