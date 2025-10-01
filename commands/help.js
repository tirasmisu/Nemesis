const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Command framework
const { BaseCommand } = require('../utils/commandTemplate');

class HelpCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('help')
                .setDescription('Displays a list of available commands')
                .addStringOption(option =>
                    option.setName('category')
                        .setDescription('The category of commands to view')
                        .setRequired(false)
                        .addChoices(
                            { name: 'General', value: 'general' },
                            { name: 'Utility', value: 'utility' },
                            { name: 'XP & Levels', value: 'xp' },
                            { name: 'Voice', value: 'voice' },
                            { name: 'All Commands', value: 'all' }
                        )
                )
        );

        // Define public commands (commands that regular members can use)
        this.publicCommands = [
            { name: 'ping', description: 'Check bot latency', category: 'general' },
            { name: 'help', description: 'Show available commands', category: 'general' },
            { name: 'userinfo', description: 'View information about a user', category: 'general' },
            { name: 'avatar', description: 'View a user\'s avatar', category: 'general' },
            { name: 'rank', description: 'Check your server rank', category: 'xp' },
            { name: 'leaderboard', description: 'View the server XP leaderboard', category: 'xp' },
            { name: 'level', description: 'Check your current level', category: 'xp' },
            { name: 'invite', description: 'Invite a user to your voice channel', category: 'voice' },
            { name: 'nickname', description: 'Request a nickname change', category: 'utility' },
            { name: 'translate', description: 'Translate text to another language', category: 'utility' }
        ];

        // Cache commands by category
        this.commandCategories = {
            general: [],
            utility: [],
            xp: [],
            voice: [],
        };

        this.organizeCommands();
    }

    organizeCommands() {
        // Organize commands by category
        for (const command of this.publicCommands) {
            if (this.commandCategories[command.category]) {
                this.commandCategories[command.category].push(command);
            }
        }
    }

    async executeCommand(interaction) {
        const category = interaction.options.getString('category') || 'all';
        
        return { category };
    }

    async sendResponse(interaction, { category }) {
        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('📋 Command Help')
            .setFooter({ text: 'Use /help [category] to see specific categories' });

        if (category === 'all') {
            embed.setDescription('Here are all available commands for you:');
            
            // Add each category as a field
            for (const [categoryName, commands] of Object.entries(this.commandCategories)) {
                if (commands.length > 0) {
                    const formattedCategory = categoryName.charAt(0).toUpperCase() + categoryName.slice(1);
                    const commandList = commands.map(cmd => `\`/${cmd.name}\` - ${cmd.description}`).join('\n');
                    
                    embed.addFields({ name: `${formattedCategory} Commands`, value: commandList });
                }
            }
        } else {
            // Show specific category
            const commands = this.commandCategories[category];
            const formattedCategory = category.charAt(0).toUpperCase() + category.slice(1);
            
            embed.setDescription(`Here are the ${formattedCategory} commands available to you:`);
            
            if (commands && commands.length > 0) {
                const commandList = commands.map(cmd => `\`/${cmd.name}\` - ${cmd.description}`).join('\n');
                embed.addFields({ name: `${formattedCategory} Commands`, value: commandList });
            } else {
                embed.addFields({ name: `${formattedCategory} Commands`, value: 'No commands found in this category that you can use.' });
            }
        }

        // Discord Nitro perks - removed voice channels section and replaced with this
        if (category === 'all' || category === 'voice') {
            embed.addFields({ 
                name: '✨ Special Access Features',
                value: 'The following features are exclusively available to:\n**Staff Members & Discord Nitro Boosters**\n• Create private voice channels\n• Invite others to private channels using `/invite`\n• Use the invite channel'
            });
        }

        await interaction.reply({ embeds: [embed], flags: ['Ephemeral'] });
    }
}

module.exports = new HelpCommand(); 
