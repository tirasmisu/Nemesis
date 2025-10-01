const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Command framework
const { BaseCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorHandler');

// Helpers & services
const { checkModerationPermission } = require('../utils/commandHelpers');

class AvatarCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('avatar')
                .setDescription('Show the avatar of a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user whose avatar you want to view')
                        .setRequired(true)
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
        const hasPermission = await checkModerationPermission(interaction, 'helpers');
        if (!hasPermission) {
            throw createValidationError('You do not have permission to use this command.');
        }
        const user = interaction.options.getUser('user');
        if (!user) {
            throw createValidationError('User is required.');
        }
        return { user };
    }

    async executeCommand(interaction) {
        const { user } = await this.validateInput(interaction);
        const avatarURL = user.displayAvatarURL({ dynamic: true, size: 1024 });
        const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setDescription(`### **Avatar of** <@${user.id}>`)
            .setFooter({ text: `ID: ${user.id}` })
            .setImage(avatarURL);

        return { embed };
    }

    async sendResponse(interaction, result) {
        if (interaction.deferred) {
            await interaction.editReply({ embeds: [result.embed] });
        } else {
            await interaction.reply({ embeds: [result.embed] });
        }
    }
}

module.exports = new AvatarCommand();
