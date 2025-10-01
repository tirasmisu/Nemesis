const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getLeaderboard } = require('../services/xpService');
const { BaseCommand } = require('../utils/commandTemplate');

class LeaderboardCommand extends BaseCommand {
    constructor() {
        super(new SlashCommandBuilder()
            .setName('leaderboard')
            .setDescription('View the server XP leaderboard')
            .addIntegerOption(option => 
                option.setName('limit')
                    .setDescription('Number of users to show (default: 10, max: 25)')
                    .setMinValue(5)
                    .setMaxValue(25)
                    .setRequired(false))
        );
    }

    shouldDeferReply() {
        return false;
    }

    isEphemeral() {
        return false;
    }

    async validateInput(interaction) {
        const limit = interaction.options.getInteger('limit') || 10;
        return { limit };
    }

    async executeCommand(interaction) {
        const { limit } = await this.validateInput(interaction);
        
        // Get leaderboard data
        const leaderboardData = await getLeaderboard(interaction.guild.id, limit);
        
        if (!leaderboardData || !leaderboardData.length) {
            return { 
                empty: true,
                limit
            };
        }
        
        // Process leaderboard entries
        const processedEntries = [];
        
        for (const entry of leaderboardData) {
            try {
                // Try to fetch the user to get their username and avatar
                const user = await interaction.client.users.fetch(entry.userId).catch(() => null);
                
                processedEntries.push({
                    userId: entry.userId,
                    username: user ? user.username : 'Unknown User',
                    avatarURL: user ? user.displayAvatarURL({ dynamic: true }) : null,
                    xp: entry.xp,
                    level: entry.level
                });
            } catch (error) {
                console.error(`[Leaderboard] Error processing entry for ${entry.userId}:`, error);
                // Still add the entry with default values if user fetch fails
                processedEntries.push({
                    userId: entry.userId,
                    username: 'Unknown User',
                    avatarURL: null,
                    xp: entry.xp,
                    level: entry.level
                });
            }
        }
        
        return { 
            entries: processedEntries,
            limit,
            empty: false
        };
    }

    async sendResponse(interaction, result) {
        const { entries, limit, empty } = result;
        
        if (empty) {
            await interaction.followUp({
                content: 'No XP data found for this server yet. Start chatting to earn XP!'
            });
            return;
        }
        
        // Create medals for top 3
        const medals = ['🥇', '🥈', '🥉'];
        
        // Format leaderboard entries
        let description = '';
        
        entries.forEach((entry, index) => {
            const medal = index < 3 ? medals[index] : `${index + 1}.`;
            description += `${medal} <@${entry.userId}> • Level ${entry.level} • ${entry.xp} XP\n`;
        });
        
        // Create embed
        const embed = new EmbedBuilder()
            .setColor('#FFD700') // Gold color
            .setTitle(`${interaction.guild.name} XP Leaderboard`)
            .setDescription(description)
            .setFooter({ 
                text: `Showing top ${entries.length} out of ${await interaction.guild.memberCount} members` 
            })
            .setTimestamp();
        
        // Add server icon if available
        if (interaction.guild.iconURL()) {
            embed.setThumbnail(interaction.guild.iconURL({ dynamic: true }));
        }
        
        await interaction.followUp({ embeds: [embed] });
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

module.exports = new LeaderboardCommand(); 
