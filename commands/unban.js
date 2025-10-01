const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { ModerationCommand } = require('../utils/commandTemplate');
const { createValidationError } = require('../utils/errorManager');
const { checkModerationPermission } = require('../utils/commandHelpers');
const ModerationAction = require('../models/ModerationAction');
const { generateUniquePunishmentId } = require('../utils/generatePunishmentId');
const { createSmartUserMention } = require('../utils/utils');
const channelConfig = require('../config/channels');

class UnbanCommand extends ModerationCommand {
    constructor() {
        super(new SlashCommandBuilder()
            .setName('unban')
            .setDescription('Unban a user from the server by their user ID')
            .addStringOption(option =>
                option.setName('userid')
                    .setDescription('The user ID to unban')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for the unban')
                    .setRequired(true)));
                    
        this.category = 'moderation';
        this.cooldown = 10;
    }

    async validateInput(interaction) {
        // Check if the user has permission to unban
        if (!await checkModerationPermission(interaction, 'mods')) {
            throw createValidationError('You do not have permission to use this command.');
        }

        const userId = interaction.options.getString('userid');
        const reason = interaction.options.getString('reason');
        
        // Fetch the ban list to ensure the user is banned
        const bans = await interaction.guild.bans.fetch();
        const bannedUser = bans.find(ban => ban.user.id === userId);

        if (!bannedUser) {
            throw createValidationError(`No ban found for user ID: ${userId}.`);
        }

        return { userId, reason, bannedUser };
    }

    async executeCommand(interaction) {
        const userId = interaction.options.getString('userid');
        const reason = interaction.options.getString('reason');
        const bans = await interaction.guild.bans.fetch();
        const bannedUser = bans.find(ban => ban.user.id === userId);
        
        // Unban the user
        await interaction.guild.members.unban(userId, reason);

        // Generate a unique punishment ID for the unban action
        const punishmentId = await generateUniquePunishmentId();

        // Save the unban action in the database
        const action = new ModerationAction({
            userId: userId,
            moderatorId: interaction.user.id,
            action: 'unban',
            reason,
            actionId: punishmentId,
            timestamp: new Date(),
            active: false, // Unban actions are not active punishments
        });

        await action.save();

        // Notify the user about the unban and provide an invite link
        try {
            await bannedUser.user.send(`You have been unbanned from **${interaction.guild.name}**.\nReason: **${reason}**.\nYou can rejoin the server using this link: https://discord.gg/tranium`);
        } catch (err) {
            console.error('Could not send DM to the user:', err);
        }

        return {
            target: bannedUser.user,
            reason,
            punishmentId,
            success: true
        };
    }

    async sendResponse(interaction, result) {
        if (result.success) {
            await interaction.editReply({ 
                content: `User ID ${result.target.id} has been unbanned.`,
                flags: undefined 
            });
        }
    }

    async logAction(interaction, result) {
        // Create smart user mentions
        const userMention = await createSmartUserMention(result.target.id, interaction.client, interaction.guild, { showRawId: true });
        const moderatorMention = await createSmartUserMention(interaction.user.id, interaction.client, interaction.guild, { showRawId: true });

        const embed = new EmbedBuilder()
            .setColor(0x00FF00) // Green color for unban action
            .setDescription(`### **Moderation Log**`)
            .setFooter({ text: `ID: ${result.target.id}` })
            .addFields({
                name: "🔓 Unban",
                value: `**User ID:** ${userMention}\n**Reason:** ${result.reason}\n**Moderator:** ${moderatorMention}`,
                inline: false,
            });

        // Get the moderation log channel from config
        const channelId = channelConfig.getId('MODERATION_LOG');
        const logChannel = interaction.guild.channels.cache.get(channelId);

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

module.exports = new UnbanCommand();
