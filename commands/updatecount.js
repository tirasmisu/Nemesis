const { SlashCommandBuilder } = require('discord.js');
const { BaseCommand } = require('../utils/commandTemplate');
const { createValidationError } = require('../utils/errorManager');
const { checkModerationPermission } = require('../utils/commandHelpers');

class UpdateCountCommand extends BaseCommand {
    constructor() {
        super(new SlashCommandBuilder()
            .setName('updatecount')
            .setDescription('Manually update the member count voice channel'));
            
        this.category = 'moderation';
        this.cooldown = 10;
    }

    shouldDeferReply() {
        return true;
    }

    isEphemeral() {
        return true;
    }

    async validateInput(interaction) {
        // Check if user has mod permissions
        if (!await checkModerationPermission(interaction, 'mods')) {
            throw createValidationError('You do not have permission to use this command.');
        }
    }

    async executeCommand(interaction) {
        const channel = await interaction.client.channels.fetch('1067589064666136606');
        if (!channel) {
            throw new Error('Voice channel not found.');
        }

        const guild = channel.guild;
        const memberCount = guild.memberCount;
        const formattedCount = memberCount.toLocaleString();
        
        // Update the channel name with the member count
        await channel.setName(`👤」Members: ${formattedCount}`);
        
        return { 
            memberCount: formattedCount,
            success: true 
        };
    }

    async sendResponse(interaction, result) {
        if (result.success) {
            await interaction.followUp({
                content: `Successfully updated member count to ${result.memberCount}!`,
                flags: ['Ephemeral']
            });
        }
    }

    shouldLogAction() {
        return false;
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

module.exports = new UpdateCountCommand(); 
