const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } = require('discord.js');
const { BaseCommand } = require('../utils/commandTemplate');
const { createValidationError } = require('../utils/errorHandler');
const { checkModerationPermission } = require('../utils/commandHelpers');
const ModerationAction = require('../models/ModerationAction');
const ms = require('ms');

class StaffViewCommand extends BaseCommand {
    constructor() {
        super(new SlashCommandBuilder()
            .setName('staffview')
            .setDescription('View a user\'s moderation history')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('The user to view')
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
        // Check if user has proper permissions - changed from 'helpers' to 'srmods'
        if (!await checkModerationPermission(interaction, 'srmods')) {
            throw createValidationError('You do not have permission to view staff moderation history. Sr Mod+ required.');
        }
        
        const user = interaction.options.getUser('user');
        if (!user) {
            throw createValidationError('You must specify a user to view.');
        }
        
        return { user };
    }

    async executeCommand(interaction) {
        const user = interaction.options.getUser('user');
        
        // Fetch all moderation actions where the specified user was the moderator
        const history = await ModerationAction.find({ moderatorId: user.id })
            .sort({ timestamp: -1 });

        return { user, history, success: true };
    }

    async sendResponse(interaction, result) {
        if (!result.success) {
            return interaction.editReply({ content: `Error: ${result.error || 'An unknown error occurred'}` });
        }

        const { user, history } = result;
        
        // If no history, send a simple message
        if (!history || history.length === 0) {
            return interaction.editReply({ 
                content: `${user.tag} has not issued any moderation actions.`
            });
        }

        // Set up pagination
        const itemsPerPage = 3;
        const totalPages = Math.ceil(history.length / itemsPerPage);
        let page = 0;

        // Function to create the embed for the current page
        const createEmbed = (page) => {
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`Staff Actions`)
                .setDescription(`👤 **Staff Member:** <@${user.id}> (${user.tag})`)
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `Page ${page + 1} of ${totalPages} | Staff ID: ${user.id}` })
                .setTimestamp();

            const start = page * itemsPerPage;
            const end = Math.min(start + itemsPerPage, history.length);
            
            for (let i = start; i < end; i++) {
                const action = history[i];
                const status = action.active ? '🟢 Active' : '🔴 Inactive';
                const duration = action.duration 
                    ? `\nDuration: ${typeof action.duration === 'string' ? action.duration : ms(action.duration, { long: true })}` 
                    : '';
                const timestamp = Math.floor(new Date(action.timestamp).getTime() / 1000);
                
                embed.addFields({
                    name: `${action.action.toUpperCase()} (${status})`,
                    value: `ID: ${action.actionId}\nUser: <@${action.userId}>\nReason: ${action.reason}${duration}\nDate: <t:${timestamp}:F>`,
                    inline: false
                });
            }
            
            return embed;
        };

        // Create navigation buttons
        const previousButton = new ButtonBuilder()
            .setCustomId('previous')
            .setLabel('Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true); // Initially disabled since we start at page 0

        const nextButton = new ButtonBuilder()
            .setCustomId('next')
            .setLabel('Next')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(totalPages <= 1); // Disabled if there's only one page

        const row = new ActionRowBuilder().addComponents(previousButton, nextButton);

        // Send initial message with first page
        const replyMessage = await interaction.editReply({ 
            embeds: [createEmbed(page)], 
            components: [row]
        });

        // Set up collector for button interactions
        const collector = replyMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60000, // 1 minute timeout
            filter: i => i.user.id === interaction.user.id
        });

        collector.on('collect', async i => {
            if (i.customId === 'previous' && page > 0) page--;
            if (i.customId === 'next' && page < totalPages - 1) page++;

            // Update button status
            previousButton.setDisabled(page === 0);
            nextButton.setDisabled(page === totalPages - 1);

            // Update the message with new page
            await i.update({ 
                embeds: [createEmbed(page)], 
                components: [row] 
            });
        });

        collector.on('end', () => {
            // Wrap the edit in a try-catch to handle message update failures gracefully
            try {
                replyMessage.edit({ components: [] }).catch(error => {
                    console.log('Failed to remove buttons from staffview after timeout:', error.message);
                });
            } catch (error) {
                console.log('Error in staffview collector end handler:', error.message);
            }
        });
    }

    shouldLogAction() {
        return false;
    }

    async execute(interaction) {
        try {
            const validation = await this.validateInput(interaction);
            if (!validation || interaction.replied || interaction.deferred) return;
            await interaction.deferReply();
            const result = await this.executeCommand(interaction);
            await this.sendResponse(interaction, result);
        } catch (error) {
            // Only log or throw, do not reply here
            console.error('[STAFFVIEW] Error:', error);
            throw error;
        }
    }
}

module.exports = new StaffViewCommand();
