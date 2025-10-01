const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Command framework
const { BaseCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorHandler');

// Helpers & services
const { checkModerationPermission, COMMAND_CONFIG } = require('../utils/commandHelpers');

// Role configuration for ID-based checking
const roleConfig = require('../config/roles');

// Channel configuration
const channelConfig = require('../config/channels');

class HelpStaffCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('helpstaff')
                .setDescription('Shows all available commands based on your highest role')
        );
    }

    shouldDeferReply() {
        return true;
    }

    isEphemeral() {
        return true;
    }

    async validateInput(interaction) {
        try {
            const hasPermission = await checkModerationPermission(interaction, 'helpers');
            return hasPermission ? {} : false;
        } catch (error) {
            console.error('[HELPSTAFF] Error in validation:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred while validating this command. The error has been logged.',
                    flags: ['Ephemeral']
                });
            }
            return false;
        }
    }

    async executeCommand(interaction) {
        const { user, member } = interaction;
        let highestRole = 'helpers';
        let roleColor = 0x00ff99;
        let roleTitle = 'Helper';
        let roleDescription = 'These commands are available to Helpers:';

        // Use ID-based role checking for security and reliability
        if (roleConfig.memberHasRole(member, 'T') || roleConfig.memberHasRole(member, 'ADMINS')) {
            highestRole = 'admins';
            roleColor = 0xe67e22;
            roleTitle = 'Admin';
            roleDescription = 'These commands are available to Admins:';
        } 
        else if (roleConfig.memberHasRole(member, 'SENIOR_MODERATORS')) {
            highestRole = 'seniorMods';
            roleColor = 0x8e44ad;
            roleTitle = 'Senior Moderator';
            roleDescription = 'These commands are available to Senior Moderators:';
        } 
        else if (roleConfig.memberHasRole(member, 'MODERATORS')) {
            highestRole = 'mods';
            roleColor = 0xff5555;
            roleTitle = 'Moderator';
            roleDescription = 'These commands are available to Moderators:';
        }

        const embed = new EmbedBuilder()
            .setColor(roleColor)
            .setTitle(`Staff Commands for ${roleTitle}+`)
            .setDescription(roleDescription)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }));

        // Add appropriate staff command fields based on role
        if (highestRole === 'admins') {
            embed.addFields(
                { name: 'Admin Commands', value: COMMAND_CONFIG.admins.commands.map(cmd => `\`${cmd.name}\` — ${cmd.value}`).join('\n') },
                { name: 'Senior Mod Commands', value: COMMAND_CONFIG.seniorMods.commands.map(cmd => `\`${cmd.name}\` — ${cmd.value}`).join('\n') },
                { name: 'Mod Commands', value: COMMAND_CONFIG.mods.commands.map(cmd => `\`${cmd.name}\` — ${cmd.value}`).join('\n') }
            );
            
            // Split helper commands into two fields to stay under 1024 character limit
            const helperCmds = COMMAND_CONFIG.helpers.commands;
            const midpoint = Math.ceil(helperCmds.length / 2);
            const firstHalf = helperCmds.slice(0, midpoint);
            const secondHalf = helperCmds.slice(midpoint);
            
            embed.addFields(
                { name: 'Helper Commands', value: firstHalf.map(cmd => `\`${cmd.name}\` — ${cmd.value}`).join('\n'), inline: false },
                { name: '', value: secondHalf.map(cmd => `\`${cmd.name}\` — ${cmd.value}`).join('\n'), inline: false }
            );
        } else if (highestRole === 'seniorMods') {
            embed.addFields(
                { name: 'Senior Mod Commands', value: COMMAND_CONFIG.seniorMods.commands.map(cmd => `\`${cmd.name}\` — ${cmd.value}`).join('\n') },
                { name: 'Mod Commands', value: COMMAND_CONFIG.mods.commands.map(cmd => `\`${cmd.name}\` — ${cmd.value}`).join('\n') }
            );
            
            // Split helper commands into two fields to stay under 1024 character limit
            const helperCmds = COMMAND_CONFIG.helpers.commands;
            const midpoint = Math.ceil(helperCmds.length / 2);
            const firstHalf = helperCmds.slice(0, midpoint);
            const secondHalf = helperCmds.slice(midpoint);
            
            embed.addFields(
                { name: 'Helper Commands', value: firstHalf.map(cmd => `\`${cmd.name}\` — ${cmd.value}`).join('\n'), inline: false },
                { name: '', value: secondHalf.map(cmd => `\`${cmd.name}\` — ${cmd.value}`).join('\n'), inline: false }
            );
        } else if (highestRole === 'mods') {
            embed.addFields(
                { name: 'Mod Commands', value: COMMAND_CONFIG.mods.commands.map(cmd => `\`${cmd.name}\` — ${cmd.value}`).join('\n') }
            );
            
            // Split helper commands into two fields to stay under 1024 character limit
            const helperCmds = COMMAND_CONFIG.helpers.commands;
            const midpoint = Math.ceil(helperCmds.length / 2);
            const firstHalf = helperCmds.slice(0, midpoint);
            const secondHalf = helperCmds.slice(midpoint);
            
            embed.addFields(
                { name: 'Helper Commands', value: firstHalf.map(cmd => `\`${cmd.name}\` — ${cmd.value}`).join('\n'), inline: false },
                { name: '', value: secondHalf.map(cmd => `\`${cmd.name}\` — ${cmd.value}`).join('\n'), inline: false }
            );
        } else {
            // Split helper commands into two fields to stay under 1024 character limit
            const helperCmds = COMMAND_CONFIG.helpers.commands;
            const midpoint = Math.ceil(helperCmds.length / 2);
            const firstHalf = helperCmds.slice(0, midpoint);
            const secondHalf = helperCmds.slice(midpoint);
            
            embed.addFields(
                { name: 'Helper Commands', value: firstHalf.map(cmd => `\`${cmd.name}\` — ${cmd.value}`).join('\n'), inline: false },
                { name: '', value: secondHalf.map(cmd => `\`${cmd.name}\` — ${cmd.value}`).join('\n'), inline: false }
            );
        }

        // Add voice channel command info for staff
        embed.addFields({ 
            name: '🔊 Voice Channels',
            value: 'Voice channels created with "Join to Create" have these features:\n• Only creator can invite members with `/invite`\n• Channel is deleted when creator leaves\n• The channel uses the creator\'s nickname\n• Users must be re-invited if they leave'
        });

        // Add reminder about public commands
        embed.addFields({
            name: '💡 Public Commands',
            value: 'Use `/help` to view all public user commands available to everyone.',
            inline: false
        });

        let footerText;
        switch (highestRole) {
            case 'admins':
                footerText = 'You have access to all commands. Use them responsibly!';
                break;
            case 'seniorMods':
                footerText = 'Senior Moderator commands include punishment management and advanced moderation.';
                break;
            case 'mods':
                footerText = 'Moderator commands include ban, kick, mute, and role management.';
                break;
            default:
                footerText = 'Helper commands are focused on basic moderation and user info.';
        }
        embed.setFooter({ text: footerText });

        return { embed, user };
    }

    async sendResponse(interaction, result) {
        await interaction.editReply({ embeds: [result.embed] });
    }
}

module.exports = new HelpStaffCommand();