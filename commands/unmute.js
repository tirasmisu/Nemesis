const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { BaseCommand } = require('../utils/commandTemplate');
const { createValidationError } = require('../utils/errorHandler');
const { checkModerationPermission, checkTargetHierarchy, showModview } = require('../utils/commandHelpers');
const { notifyUser } = require('../utils/utils');
const channelConfig = require('../config/channels');
const roleConfig = require('../config/roles');
const ModerationAction = require('../models/ModerationAction');
const { manualUnmute } = require('../utils/muteManager');

class UnmuteCommand extends BaseCommand {
    constructor() {
        super(new SlashCommandBuilder()
            .setName('unmute')
            .setDescription('Unmute a user')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('The user to unmute')
                    .setRequired(true)));
                    
        this.category = 'moderation';
        this.cooldown = 5;
    }

    async validateInput(interaction) {
        // Check if user has permission to unmute
        if (!await checkModerationPermission(interaction, 'helpers')) {
            return { error: true, message: 'You do not have permission to use this command.' };
        }
        
        const targetUser = interaction.options.getUser('user');
        if (!targetUser) {
            return { error: true, message: 'Could not find the specified user.' };
        }
        
        const user = interaction.guild.members.cache.get(targetUser.id);
        if (!user) {
            return { error: true, message: 'User is not in this server.' };
        }

        // Check if target is staff
        if (!await checkTargetHierarchy(interaction, user)) {
            return { error: true, message: 'You cannot unmute a staff member.' };
        }

        // Get mute role using role config
        const muteRole = interaction.guild.roles.cache.get(roleConfig.getId('MUTED'));
        if (!muteRole) {
            return { error: true, message: "Mute role not found. Please create a role named 'Muted'." };
        }

        // Check for active mute
        const activeMute = await ModerationAction.findOne({
            userId: user.id,
            action: 'mute',
            active: true
        });

        if (!activeMute) {
            return { error: true, message: 'This user is not currently muted.' };
        }

        return { user, muteRole, activeMute };
    }

    async executeCommand(interaction) {
        const validation = await this.validateInput(interaction);
        if (validation.error) {
            return validation;
        }
        
        const { user, muteRole, activeMute } = validation;
        
        try {
            // Update the database record to set active: false FIRST
            const updatedMute = await ModerationAction.findOneAndUpdate(
                { userId: user.id, action: 'mute', actionId: activeMute.actionId, active: true },
                { active: false },
                { new: true }
            );
            
            if (!updatedMute) {
                return { error: true, message: 'Failed to update mute record in database.' };
            }
            
            console.log(`[UNMUTE] Updated database record for ${user.user.tag}, actionId: ${activeMute.actionId}`);

            // Clear any active timeout using the mute manager's manualUnmute function
            // This also handles logging to the moderation channel
            await manualUnmute(interaction.guild, user.user, 'Manual unmute by moderator', interaction.user);

            // Remove mute role
            await user.roles.remove(muteRole);
            console.log(`[UNMUTE] Removed mute role from ${user.user.tag}`);

            return {
                target: user,
                reason: 'Manual unmute',
                punishmentId: activeMute.actionId,
                success: true
            };
        } catch (error) {
            console.error(`[UNMUTE] Error during unmute process:`, error);
            return { error: true, message: 'An error occurred while unmuting the user.' };
        }
    }

    async sendResponse(interaction, result) {
        let message;
        
        if (result.error) {
            message = result.message;
        } else if (result.success) {
            message = `${result.target.user.tag} has been unmuted.`;
        }
        
        try {
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({
                    content: message
                });
            } else if (!interaction.replied) {
                await interaction.reply({
                    content: message,
                    flags: ['Ephemeral']
                });
            } else {
                console.log(`[UNMUTE] Response: ${message}`);
            }
            
            // Try to show modview if it was a successful unmute
            if (result.success && !result.error) {
                try {
                    await showModview(interaction, result.target.user, true, true);
                } catch (viewError) {
                    console.log('Error showing modview after unmute:', viewError.message);
                    // Silently fail - this is just an auxiliary feature
                }
            }
        } catch (error) {
            console.log(`[UNMUTE] Response failed but operation succeeded: ${message}`);
            console.log(`[UNMUTE] Error: ${error.message}`);
        }
    }
}

module.exports = new UnmuteCommand();
