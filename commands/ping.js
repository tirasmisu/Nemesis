const { SlashCommandBuilder } = require('discord.js');

// Command framework
const { BaseCommand } = require('../utils/commandTemplate');

class PingCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('ping')
                .setDescription('Replies with the bot latency')
        );
    }

    shouldDeferReply() {
        return false;
    }

    async executeCommand(interaction) {
        const sent = await interaction.reply({ content: 'Pinging...', withResponse: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        
        return { latency, apiLatency: interaction.client.ws.ping };
    }

    async sendResponse(interaction, { latency, apiLatency }) {
        await interaction.editReply(
            `🏓 Pong!\n• Bot Latency: ${latency}ms\n• API Latency: ${apiLatency}ms`
        );
    }
}

module.exports = new PingCommand();
