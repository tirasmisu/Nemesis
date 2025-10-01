const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Command framework
const { BaseCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorHandler');

// Role configuration
const roleConfig = require('../config/roles');

class OOOCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('ooo')
                .setDescription('Toggle Out of Office role on/off for staff members')
        );
    }

    shouldDeferReply() {
        return true;
    }

    isEphemeral() {
        return true;
    }

    shouldLogAction() {
        return false; // No logging for OOO role changes
    }

    async validateInput(interaction) {
        try {
            // Check if user is staff member
            const member = interaction.member;
            const isStaff = roleConfig.memberHasRole(member, 'STAFF');
            
            if (!isStaff) {
                throw createValidationError('This command is only available to staff members.');
            }

            return { member };
        } catch (error) {
            console.error('[OOO] Error in validation:', error);
            throw error;
        }
    }

    async executeCommand(interaction) {
        const { member } = await this.validateInput(interaction);
        
        // Get the OOO role
        const OOO_ROLE_ID = '1283960908753932328';
        const oooRole = interaction.guild.roles.cache.get(OOO_ROLE_ID);
        
        if (!oooRole) {
            throw new Error('Out of Office role not found. Please contact an administrator.');
        }

        // Check if user currently has OOO role
        const hasOOORole = member.roles.cache.has(OOO_ROLE_ID);
        let action;
        let statusMessage;

        try {
            if (hasOOORole) {
                // Remove OOO role
                await member.roles.remove(oooRole);
                action = 'removed';
                statusMessage = '✅ You are now **back in office**! The Out of Office role has been removed.';
                console.log(`[OOO] Removed OOO role from ${member.user.tag}`);
            } else {
                // Add OOO role
                await member.roles.add(oooRole);
                action = 'added';
                statusMessage = '🏖️ You are now **out of office**! You will not be able to use moderation commands while this role is active.';
                console.log(`[OOO] Added OOO role to ${member.user.tag}`);
            }

            return {
                member,
                action,
                statusMessage,
                success: true
            };

        } catch (error) {
            console.error(`[OOO] Error ${hasOOORole ? 'removing' : 'adding'} OOO role for ${member.user.tag}:`, error);
            throw new Error(`Failed to ${hasOOORole ? 'remove' : 'add'} Out of Office role. Please try again or contact an administrator.`);
        }
    }

    async sendResponse(interaction, result) {
        const { statusMessage, action } = result;
        
        const embed = new EmbedBuilder()
            .setColor(action === 'added' ? 0xFFA500 : 0x00FF00) // Orange for OOO, Green for back
            .setTitle(action === 'added' ? '🏖️ Out of Office' : '✅ Back in Office')
            .setDescription(statusMessage)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }

    async execute(interaction) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ flags: ['Ephemeral'] });
            }
            
            const result = await this.executeCommand(interaction);
            await this.sendResponse(interaction, result);
            
        } catch (error) {
            console.error('[OOO] Error in execution:', error);
            
            const errorMessage = error.message || 'An error occurred while processing your request.';
            
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ content: errorMessage });
            } else if (!interaction.replied) {
                await interaction.reply({ content: errorMessage, flags: ['Ephemeral'] });
            }
        }
    }
}

module.exports = new OOOCommand(); 