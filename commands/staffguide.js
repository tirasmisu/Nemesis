const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { BaseCommand } = require('../utils/commandTemplate');
const { checkModerationPermission } = require('../utils/commandHelpers');

class StaffGuideCommand extends BaseCommand {
    constructor() {
        super(new SlashCommandBuilder()
            .setName('staffguide')
            .setDescription('Get the link to the staff guide'));
            
        this.category = 'staff';
        this.cooldown = 5;
    }

    shouldDeferReply() {
        return true;
    }

    isEphemeral() {
        return true;
    }

    async validateInput(interaction) {
        // Check if user has staff permissions (mods or helpers)
        const hasPermission = await checkModerationPermission(interaction, 'helpers');
        return hasPermission ? {} : false;
    }

    async executeCommand(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('Staff Guide')
            .setDescription('Here is the link to the staff guide:')
            .addFields(
                { name: '📚 Staff Guide', value: '[Click here to view the Staff Guide](https://www.notion.so/204a3aacb29c8004ad40d4c717addf36?v=204a3aacb29c807eb48f000caa687a83&source=copy_link)' }
            )
            .setFooter({ text: 'Please make sure to read and follow the guidelines' });
            
        return { embed };
    }

    async sendResponse(interaction, result) {
        await interaction.editReply({ embeds: [result.embed] });
    }
}

module.exports = new StaffGuideCommand(); 
