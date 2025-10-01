const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserRank } = require('../services/xpService');
const { BaseCommand } = require('../utils/commandTemplate');

class RankCommand extends BaseCommand {
    constructor() {
        super(new SlashCommandBuilder()
            .setName('rank')
            .setDescription('View your XP rank or another user\'s rank')
            .addUserOption(option => 
                option.setName('user')
                    .setDescription('User to check rank for (defaults to yourself)')
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
        const targetUser = interaction.options.getUser('user') || interaction.user;
        return { targetUser };
    }

    async executeCommand(interaction) {
        const { targetUser } = await this.validateInput(interaction);
        
        // Get rank info from service
        const rankInfo = await getUserRank(targetUser.id, interaction.guild.id);
        
        if (!rankInfo) {
            throw new Error('Failed to retrieve rank information');
        }
        
        return { 
            targetUser,
            rankInfo
        };
    }

    async sendResponse(interaction, { targetUser, rankInfo }) {
        // Format the XP progress bar
        const progressBarLength = 20;
        const progress = rankInfo.progress || 0;
        const filledBars = Math.floor(progress * progressBarLength);
        const emptyBars = progressBarLength - filledBars;
        const progressBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
        
        // Format voice time
        let voiceTime = '';
        if (rankInfo.voiceTimeMinutes) {
            const hours = Math.floor(rankInfo.voiceTimeMinutes / 60);
            const minutes = rankInfo.voiceTimeMinutes % 60;
            voiceTime = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
        } else {
            voiceTime = '0m';
        }
        
        // Create embed
        const embed = new EmbedBuilder()
            .setColor('#00AAFF')
            .setTitle(`${targetUser.tag}'s Rank`)
            .setDescription(`User: <@${targetUser.id}>`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'Rank', value: `#${rankInfo.rank || 'N/A'}`, inline: true },
                { name: 'Level', value: rankInfo.level.toString(), inline: true },
                { name: 'XP', value: rankInfo.xp.toString(), inline: true },
                { name: 'Messages', value: (rankInfo.messageCount || 0).toString(), inline: true },
                { name: 'Voice Time', value: voiceTime, inline: true },
                { name: 'XP For Next Level', value: Math.ceil(rankInfo.xpForNextLevel).toString(), inline: true },
                { name: 'Progress', value: `\`${progressBar}\` ${Math.floor(progress * 100)}%`, inline: false }
            )
            .setFooter({ text: `Out of ${rankInfo.totalUsers} server members` })
            .setTimestamp();
        
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

module.exports = new RankCommand(); 
