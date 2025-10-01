const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Command framework
const { BaseCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorHandler');

// XP System
// Assuming we're reusing the same XP service from rank command
const { getUserXP, getLevelFromXP, getXPForLevel, getXPProgressPercent } = require('../services/xpService');

class LevelCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('level')
                .setDescription('View your current level and XP progress')
                .addUserOption(option => 
                    option.setName('user')
                        .setDescription('View level for another user (optional)')
                        .setRequired(false)
                )
        );
    }

    shouldDeferReply() {
        return false;
    }

    isEphemeral() {
        return false;
    }

    async validateInput(interaction) {
        return true; // Simple validation - just return true
    }

    async executeCommand(interaction) {
        try {
            // Get target user from the options instead of from validation
            const targetUser = interaction.options.getUser('user') || interaction.user;
            
            // Get user XP from database
            const xp = await getUserXP(targetUser.id, interaction.guild.id);
            
            if (xp === null || xp === undefined) {
                throw createValidationError(`${targetUser.id === interaction.user.id ? 'You have' : 'This user has'} no XP recorded yet. Start chatting to gain XP!`);
            }
            
            // Calculate level and progress
            const currentLevel = getLevelFromXP(xp);
            const xpForCurrentLevel = getXPForLevel(currentLevel);
            const xpForNextLevel = getXPForLevel(currentLevel + 1);
            const xpProgress = xp - xpForCurrentLevel;
            const xpNeeded = xpForNextLevel - xpForCurrentLevel;
            const progressPercent = getXPProgressPercent(xp);
            
            // Create progress bar
            const barLength = 20;
            const filledLength = Math.round((progressPercent / 100) * barLength);
            const progressBar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
            
            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle(`${targetUser.username}'s Level`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'Current Level', value: `Level ${currentLevel}`, inline: true },
                    { name: 'Total XP', value: `${xp} XP`, inline: true },
                    { name: 'Next Level', value: `Level ${currentLevel + 1}`, inline: true },
                    { name: 'Progress', value: `${progressBar} ${progressPercent}%\n${xpProgress}/${xpNeeded} XP needed for next level` }
                )
                .setFooter({ text: 'Gain XP by being active in chat!' })
                .setTimestamp();
                
            return { embed, targetUser };
            
        } catch (error) {
            if (error.validationError) {
                throw error;
            }
            console.error(`Error in level command:`, error);
            throw createValidationError('Error retrieving level information. Please try again later.');
        }
    }

    async sendResponse(interaction, { embed, targetUser }) {
        const isOwnLevel = targetUser.id === interaction.user.id;
        const content = isOwnLevel ? 
            `Here's your current level:` : 
            `Here's the level for ${targetUser.username}:`;
            
        if (interaction.deferred) {
            await interaction.editReply({ content, embeds: [embed] });
        } else {
            await interaction.reply({ content, embeds: [embed] });
        }
    }


}

module.exports = new LevelCommand(); 
