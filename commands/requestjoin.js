const { SlashCommandBuilder } = require('discord.js');
const { createJoinRequest } = require('../services/joinRequestService');
const { BaseCommand } = require('../utils/commandTemplate');

class RequestJoinCommand extends BaseCommand {
    constructor() {
        super(new SlashCommandBuilder()
            .setName('requestjoin')
            .setDescription('Request to join someone\'s voice channel with interactive accept/decline buttons')
            .addUserOption(option => 
                option.setName('user')
                    .setDescription('User whose voice channel you want to join')
                    .setRequired(true))
        );
    }

    shouldDeferReply() {
        return true;
    }

    isEphemeral() {
        return true;
    }

    async validateInput(interaction) {
        const targetUser = interaction.options.getUser('user');
        
        if (!targetUser) {
            throw new Error('You must specify a user whose voice channel you want to join.');
        }
        
        if (targetUser.id === interaction.user.id) {
            throw new Error('You cannot request to join your own voice channel.');
        }
        
        if (targetUser.bot) {
            throw new Error('You cannot request to join a bot\'s voice channel.');
        }
        
        return { targetUser };
    }

    async executeCommand(interaction) {
        const { targetUser } = await this.validateInput(interaction);
        
        // Create interactive join request
        const result = await createJoinRequest(interaction, targetUser.id);
        
        return {
            success: result.success,
            message: result.message
        };
    }

    async sendResponse(interaction, result) {
        await interaction.followUp({
            content: result.message,
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
                await interaction.editReply({ content: 'An error occurred while processing your request.' });
            } else if (!interaction.replied) {
                await interaction.reply({ content: 'An error occurred while processing your request.', flags: ['Ephemeral'] });
            }
        }
    }
}

module.exports = new RequestJoinCommand(); 