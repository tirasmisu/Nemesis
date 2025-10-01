const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Command framework
const { BaseCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorHandler');

// Helpers & services
const { checkModerationPermission } = require('../utils/commandHelpers');

// Channel configuration
const channelConfig = require('../config/channels');

class SetNickCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('setnick')
                .setDescription('Set a user\'s nickname')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to change the nickname of')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('nickname')
                        .setDescription('The new nickname')
                        .setRequired(true))
        );
    }

    shouldDeferReply() {
        return false;
    }

    isEphemeral() {
        return false;
    }

    shouldLogAction() {
        return true;
    }

    async validateInput(interaction) {
        if (!await checkModerationPermission(interaction, 'helpers')) {
            throw createValidationError('You do not have permission to use this command');
        }
        
        const targetMember = interaction.options.getMember('user');
        if (!targetMember) {
            throw createValidationError('User not found in this server');
        }
        
        const newNickname = interaction.options.getString('nickname');
        if (!newNickname) {
            throw createValidationError('Nickname is required');
        }
        
        // Check if the nickname is within Discord's limit
        if (newNickname.length > 32) {
            throw createValidationError('Nickname must be 32 characters or fewer');
        }
        
        return { targetMember, newNickname };
    }

    async executeCommand(interaction) {
        const { targetMember, newNickname } = await this.validateInput(interaction);
        
        const oldNickname = targetMember.displayName;
        
        // Update the user's nickname
        await targetMember.setNickname(newNickname);
        
        return { 
            targetMember,
            oldNickname,
            newNickname,
            moderator: interaction.user
        };
    }

    async sendResponse(interaction, result) {
        const { targetMember, newNickname } = result;
        
        await interaction.followUp({
            content: `${targetMember.user.toString()}'s nickname has been changed to **${newNickname}**.`
        });
    }

    async logAction(interaction, result) {
        const { targetMember, oldNickname, newNickname, moderator } = result;
        
        // Create moderation embed
        const embed = new EmbedBuilder()
            .setColor(0x3498DB) // Blue
            .setDescription(`### **Moderation Log**`)
            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: "📝 Nickname Changed", value: `**User:** <@${targetMember.id}> (${targetMember.user.tag})`, inline: false },
                { name: "Old Nickname", value: oldNickname || "(None)", inline: true },
                { name: "New Nickname", value: newNickname, inline: true },
                { name: "Moderator", value: `<@${moderator.id}>`, inline: true }
            )
            .setTimestamp();

        // Get log channel from config and send the embed
        const logChannelId = channelConfig.getId('SERVER_LOG');
        const logChannel = interaction.guild.channels.cache.get(logChannelId);
        
        if (logChannel) {
            await logChannel.send({ embeds: [embed] });
        }
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

module.exports = new SetNickCommand();
