const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { BaseCommand } = require('../utils/commandTemplate');
const { checkModerationPermission } = require('../utils/commandHelpers');
const ModerationAction = require('../models/ModerationAction');
const channelConfig = require('../config/channels');

class DatabaseRemoveCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('databaseremove')
                .setDescription('Admin-only: Completely remove a user from the moderation database')
                .addSubcommand(subcommand => 
                    subcommand
                        .setName('byuser')
                        .setDescription('Remove a user from the database by mention/selection')
                        .addUserOption(option => 
                            option.setName('user')
                            .setDescription('The user to remove from the database')
                            .setRequired(true)
                        )
                        .addStringOption(option =>
                            option.setName('reason')
                            .setDescription('Reason for removing this user from the database')
                            .setRequired(true)
                        )
                        .addBooleanOption(option =>
                            option.setName('confirm')
                            .setDescription('Confirm that you want to permanently delete all records')
                            .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('byid')
                        .setDescription('Remove a user from the database by user ID (for users not in server)')
                        .addStringOption(option => 
                            option.setName('userid')
                            .setDescription('The user ID to remove from the database')
                            .setRequired(true)
                        )
                        .addStringOption(option =>
                            option.setName('reason')
                            .setDescription('Reason for removing this user from the database')
                            .setRequired(true)
                        )
                        .addBooleanOption(option =>
                            option.setName('confirm')
                            .setDescription('Confirm that you want to permanently delete all records')
                            .setRequired(true)
                        )
                )
        );

        this.category = 'admin';
    }

    shouldDeferReply() {
        return true;
    }

    isEphemeral() {
        return true;
    }

    async validateInput(interaction) {
        try {
            // Only allow Admins to use this command
            if (!await checkModerationPermission(interaction, 'admin')) {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: '⛔ This command requires Administrator permissions.',
                        flags: ['Ephemeral']
                    });
                }
                return false;
            }

            // Get common options
            const subcommand = interaction.options.getSubcommand();
            const reason = interaction.options.getString('reason');
            const confirmed = interaction.options.getBoolean('confirm');

            // Get user based on subcommand
            let userId, username;
            if (subcommand === 'byuser') {
                const targetUser = interaction.options.getUser('user');
                userId = targetUser.id;
                username = targetUser.tag;
            } else if (subcommand === 'byid') {
                // Validate user ID format
                userId = interaction.options.getString('userid');
                if (!/^\d{17,20}$/.test(userId)) {
                    await interaction.editReply({
                        content: '⚠️ Invalid user ID format. User IDs are typically 17-20 digit numbers.'
                    });
                    return false;
                }
                
                // Try to fetch the username if possible
                try {
                    const user = await interaction.client.users.fetch(userId);
                    username = user.tag;
                } catch (error) {
                    console.log(`[DATABASEREMOVE] Could not fetch user for ID ${userId}: ${error.message}`);
                    username = `Unknown User (${userId})`;
                }
            }

            // Require confirmation
            if (!confirmed) {
                await interaction.editReply({
                    content: '⚠️ You must confirm the deletion by setting the "confirm" option to true.',
                });
                return false;
            }

            return { userId, username, reason, confirmed };
        } catch (error) {
            console.error('[DATABASEREMOVE] Validation error:', error);
            await interaction.editReply({
                content: `An error occurred during validation: ${error.message}`
            });
            return false;
        }
    }

    async executeCommand(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();
            let userId, username;
            
            if (subcommand === 'byuser') {
                const targetUser = interaction.options.getUser('user');
                userId = targetUser.id;
                username = targetUser.tag;
            } else {
                userId = interaction.options.getString('userid');
                
                try {
                    const user = await interaction.client.users.fetch(userId);
                    username = user.tag;
                } catch (error) {
                    username = `Unknown User (${userId})`;
                }
            }
            
            const reason = interaction.options.getString('reason');
            const moderator = interaction.user;

            console.log(`[DATABASEREMOVE] Admin ${moderator.tag} (${moderator.id}) is removing ${username} (${userId}) from the database`);
            
            // Count records before deletion
            const recordCount = await ModerationAction.countDocuments({ 
                userId: userId 
            });

            if (recordCount === 0) {
                return {
                    success: true,
                    userId,
                    username,
                    reason,
                    recordCount: 0,
                    message: 'No moderation records found for this user.'
                };
            }

            // Delete all records for this user
            const result = await ModerationAction.deleteMany({ 
                userId: userId 
            });

            // Log the action (important for audit purposes)
            console.log(`[DATABASEREMOVE] Deleted ${result.deletedCount} records for user ${username} (${userId})`);

            return {
                success: true,
                userId,
                username,
                reason,
                recordCount: result.deletedCount,
                message: `Successfully removed ${result.deletedCount} moderation records.`
            };
        } catch (error) {
            console.error('[DATABASEREMOVE] Execution error:', error);
            return {
                success: false,
                error: error.message || 'An unknown error occurred'
            };
        }
    }

    async sendResponse(interaction, result) {
        try {
            if (!result.success) {
                await interaction.editReply({
                    content: `❌ Failed to remove database records: ${result.error}`
                });
                return;
            }

            // Create a response embed
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('🗑️ Database Records Removed')
                .setDescription(`Removed all moderation records for ${result.username}`)
                .addFields(
                    { name: 'User', value: `<@${result.userId}>`, inline: true },
                    { name: 'User ID', value: result.userId, inline: true },
                    { name: 'Removed Records', value: result.recordCount.toString(), inline: true },
                    { name: 'Reason', value: result.reason, inline: false },
                    { name: 'Admin', value: `<@${interaction.user.id}>`, inline: true }
                )
                .setTimestamp();

            // Send embed to the command executor
            await interaction.editReply({
                content: result.message,
                embeds: [embed]
            });
        } catch (error) {
            console.error('[DATABASEREMOVE] Response error:', error);
            if (!interaction.replied) {
                await interaction.reply({
                    content: `❌ Error sending response: ${error.message}`,
                    flags: ['Ephemeral']
                });
            }
        }
    }

    async logAction(interaction, result) {
        if (!result.success) return;

        try {
            // Create a log embed
            const logEmbed = new EmbedBuilder()
                .setColor(0xFF0000) 
                .setTitle('🚨 Database Records Removed')
                .setDescription(`Admin ${interaction.user.tag} has removed all moderation records for a user`)
                .addFields(
                    { name: 'Target User', value: `<@${result.userId}>`, inline: true },
                    { name: 'Username', value: result.username, inline: true },
                    { name: 'User ID', value: result.userId, inline: true },
                    { name: 'Removed Records', value: result.recordCount.toString(), inline: true },
                    { name: 'Reason', value: result.reason, inline: false },
                    { name: 'Admin', value: `<@${interaction.user.id}>`, inline: true }
                )
                .setTimestamp();

            // Get the admin log channel
            const logChannelId = channelConfig.getId('ADMIN_LOG');
            const logChannel = interaction.guild.channels.cache.get(logChannelId);
            
            if (logChannel) {
                await logChannel.send({ embeds: [logEmbed] });
            } else {
                console.error('[DATABASEREMOVE] Admin log channel not found');
                // Fallback to moderation log
                const modLogChannelId = channelConfig.getId('MODERATION_LOG');
                const modLogChannel = interaction.guild.channels.cache.get(modLogChannelId);
                
                if (modLogChannel) {
                    await modLogChannel.send({ embeds: [logEmbed] });
                }
            }
        } catch (error) {
            console.error('[DATABASEREMOVE] Error logging action:', error);
        }
    }

    shouldLogAction() {
        return true;
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

module.exports = new DatabaseRemoveCommand(); 
