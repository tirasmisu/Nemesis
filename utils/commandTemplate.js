const { SlashCommandBuilder } = require('discord.js');
const { handleCommandError } = require('./errorHandler');
const { checkCommandPermission } = require('./permissionManager');
const { createModerationEmbed } = require('./commandHelpers');
// Central channel configuration
const channelConfig = require('../config/channels');

// Base command template
class BaseCommand {
    constructor(data) {
        this.data = data;
        this.cooldown = data.cooldown || 0;
        this.permissions = data.permissions || [];
        this.category = data.category || 'utility';
    }

    async execute(interaction) {
        try {
            // Step 1: Ensure fresh guild member is available
            if (interaction.guild && interaction.user && !interaction.member) {
                try {
                    interaction.member = await interaction.guild.members.fetch(interaction.user.id);
                    console.log('Fetched fresh member data for interaction');
                } catch (fetchError) {
                    console.error('Could not fetch member data for interaction:', fetchError);
                }
            }
            
            // Step 3: Defer Reply (if needed)
            if (this.shouldDeferReply() && !interaction.deferred && !interaction.replied) {
                try {
                    const options = {};
                    
                    // Use flags instead of ephemeral for modern Discord.js
                    if (this.isEphemeral()) {
                        options.flags = ['Ephemeral'];
                    }
                    
                    await interaction.deferReply(options);
                } catch (deferError) {
                    // Silently handle any defer errors (like already acknowledged)
                    console.log(`Could not defer reply for ${this.data.name} command: ${deferError.message}`);
                }
            }

            // Step 4: Validate Input
            const validationResult = await this.validateInput(interaction);
            // If validation failed, send error response
            if (validationResult === false) {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'You do not have permission to use this command.', 
                        flags: ['Ephemeral'] 
                    });
                } else if (interaction.deferred) {
                    await interaction.editReply({ 
                        content: 'You do not have permission to use this command.' 
                    });
                }
                return;
            }
            // If interaction was already replied to, stop processing
            if (interaction.replied) {
                return;
            }

            // Step 5: Execute Command Logic
            const result = await this.executeCommand(interaction);

            // Step 6: Send Response
            await this.sendResponse(interaction, result);

            // Step 7: Log Action (if needed)
            if (this.shouldLogAction()) {
                await this.logAction(interaction, result);
            }

        } catch (error) {
            await handleCommandError(interaction, error, `executing ${this.data.name} command`);
        }
    }

    // Override these methods in child classes
    shouldDeferReply() {
        return false;
    }

    isEphemeral() {
        return false;
    }

    async validateInput(interaction) {
        // Override in child classes
        return true;
    }

    async executeCommand(interaction) {
        // Override in child classes
        throw new Error('executeCommand must be implemented by child class');
    }

    async sendResponse(interaction, result) {
        // Override in child classes
    }

    shouldLogAction() {
        return false;
    }

    async logAction(interaction, result) {
        // Override in child classes
    }
}

// Example moderation command template
class ModerationCommand extends BaseCommand {
    constructor(data) {
        super(data);
        this.shouldLog = true;
    }

    shouldDeferReply() {
        return true;
    }

    isEphemeral() {
        return true;
    }

    async validateInput(interaction) {
        const target = interaction.options.getUser('user');
        if (!target) {
            throw new Error('Target user is required');
        }
        return target;
    }

    async logAction(interaction, result) {
        const embed = await createModerationEmbed(
            result.punishmentId,
            this.data.name,
            {
                user: result.target,
                moderator: interaction.user,
                reason: result.reason,
                duration: result.duration
            },
            interaction.client,
            interaction.guild
        );

        // Use channel ID from central configuration
        const channelId = channelConfig.getId('MODERATION_LOG');
        const logChannel = interaction.guild.channels.cache.get(channelId);

        if (logChannel) {
            await logChannel.send({ embeds: [embed] });
        }
    }
}

module.exports = {
    BaseCommand,
    ModerationCommand
}; 
