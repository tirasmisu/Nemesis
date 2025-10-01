const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { BaseCommand } = require('../utils/commandTemplate');
const { createValidationError } = require('../utils/errorManager');
const { checkModerationPermission } = require('../utils/commandHelpers');

class UserInfoCommand extends BaseCommand {
    constructor() {
        super(new SlashCommandBuilder()
            .setName('userinfo')
            .setDescription('View information about a user')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('The user whose information you want to view')
                    .setRequired(true)));
                    
        this.category = 'moderation';
        this.cooldown = 5;
    }

    shouldDeferReply() {
        return false;
    }

    isEphemeral() {
        return false;
    }

    async validateInput(interaction) {
        // Check if the user has the 'Helpers' role
        const hasPermission = await checkModerationPermission(interaction, 'helpers');
        if (!hasPermission) {
            return false;
        }
        
        const user = interaction.options.getUser('user');
        if (!user) {
            return false;
        }
        
        return { user };
    }

    async executeCommand(interaction) {
        const user = interaction.options.getUser('user');
        const userId = user.id;
        const userAvatarURL = user.displayAvatarURL({ dynamic: true });
        const usernameTag = user.tag;

        // Check if the user is a member of the guild
        const member = await interaction.guild.members.fetch(userId).catch(() => null);

        let usernameClickable = `<@${userId}>`;
        let joinDate = 'N/A';
        let roles = 'None';

        if (member) {
            joinDate = member.joinedAt.toLocaleDateString();
            roles = member.roles.cache
                .filter(role => role.id !== interaction.guild.id)
                .map(role => role.name)
                .join(', ') || 'None';
        } else {
            usernameClickable += " *"; // Indicate the user is no longer in the guild
        }

        const accountCreationDate = user.createdAt.toLocaleDateString();

        // Create the embed
        const embed = new EmbedBuilder()
            .setColor(0x3498DB) // Blue color for user info
            .setDescription(`### **User Info |** ${usernameClickable}`)
            .setFooter({ text: `ID: ${userId}` })
            .setThumbnail(userAvatarURL)
            .addFields(
                { name: "👤 Username", value: `${usernameTag}`, inline: true },
                { name: "🆔 User ID", value: `${userId}`, inline: true },
                { name: "📅 Account Created", value: `${accountCreationDate}`, inline: true },
                { name: "📅 Joined Server", value: `${joinDate}`, inline: true },
                { name: "🎭 Roles", value: `${roles}`, inline: false }
            );

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

module.exports = new UserInfoCommand();
