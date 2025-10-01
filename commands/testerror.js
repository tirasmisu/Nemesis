const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');
const { logError } = require('../utils/errorManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('testerror')
        .setDescription('Test bot error logging to Discord (Admin only)')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of error to test')
                .setRequired(false)
                .addChoices(
                    { name: 'Logger Error', value: 'logger' },
                    { name: 'Error Manager Error', value: 'errormanager' },
                    { name: 'Uncaught Error', value: 'uncaught' }
                )
        ),
    
    async execute(interaction) {
        // Check if user has admin permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await interaction.reply({
                content: 'You need Administrator permissions to use this command.',
                ephemeral: true
            });
        }

        const errorType = interaction.options.getString('type') || 'logger';
        
        await interaction.reply({
            content: `Testing ${errorType} error logging to Discord channel...`,
            ephemeral: true
        });

        // Test different error types
        switch (errorType) {
            case 'logger':
                await logger.error('TEST_ERROR', 'This is a test error from logger', 
                    new Error('Test error message from logger'), 
                    { 
                        testData: 'This is test context',
                        userId: interaction.user.id,
                        guildId: interaction.guild.id 
                    }
                );
                break;

            case 'errormanager':
                await logError(
                    new Error('Test error message from error manager'),
                    'Testing error manager logging',
                    {
                        category: 'SYSTEM',
                        severity: 'HIGH',
                        command: 'testerror',
                        userId: interaction.user.id,
                        guildId: interaction.guild.id,
                        channelId: interaction.channel.id
                    }
                );
                break;

            case 'uncaught':
                // This will trigger an uncaught error (be careful with this!)
                setTimeout(() => {
                    throw new Error('Test uncaught error - this should be logged to Discord');
                }, 1000);
                break;

            default:
                await interaction.followUp({
                    content: 'Unknown error type specified.',
                    ephemeral: true
                });
                return;
        }

        await interaction.followUp({
            content: `✅ ${errorType} error test triggered! Check the bot error log channel to see if it was logged.`,
            ephemeral: true
        });
    }
}; 