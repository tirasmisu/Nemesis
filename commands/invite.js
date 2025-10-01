const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createVoiceInvitation } = require('../services/invitationService');
const { isUserCreatedChannel, getChannelCreator } = require('../services/voiceChannelService');
const { BaseCommand } = require('../utils/commandTemplate');
const roleConfig = require('../config/roles');

class InviteCommand extends BaseCommand {
    constructor() {
        super(new SlashCommandBuilder()
            .setName('invite')
            .setDescription('Invite a user to your voice channel with interactive accept/decline buttons')
            .addUserOption(option => 
                option.setName('user')
                    .setDescription('User to invite to your voice channel')
                    .setRequired(true))
        );
    }

    shouldDeferReply() {
        return true;
    }

    isEphemeral() {
        return true;
    }

    async validateInput(interaction) {
        const targetUser = interaction.options.getUser('user');
        const member = interaction.member;
        
        // Basic validation
        if (!targetUser) {
            throw new Error('You must specify a user to invite.');
        }
        
        if (targetUser.id === interaction.user.id) {
            throw new Error('You cannot invite yourself.');
        }
        
        if (targetUser.bot) {
            throw new Error('You cannot invite bots to your voice channel.');
        }

        // Check if the member is in a voice channel
        if (!member.voice.channel) {
            throw new Error('You need to be in a voice channel to invite someone.');
        }

        const voiceChannel = member.voice.channel;

        // Check if this is a custom created channel
        const isCreatedChannel = isUserCreatedChannel(voiceChannel.id);
        
        // Get the staff role using role config
        const staffRole = interaction.guild.roles.cache.get(roleConfig.getId('STAFF'));
        const isStaff = staffRole && member.roles.cache.has(staffRole.id);
        
        // Check if member has permission to invite
        if (isCreatedChannel) {
            const channelCreatorId = getChannelCreator(voiceChannel.id);
            
            // Allow channel creator or staff to invite others
            if (channelCreatorId !== member.id && !isStaff) {
                throw new Error('Only the channel creator or staff can invite others to this voice channel.');
            }
        } else {
            // If it's not a created channel, check if user has permission to manage channels
            const hasPermission = member.permissions.has(PermissionFlagsBits.ManageChannels) || 
                                 isStaff ||
                                 roleConfig.memberHasRole(member, 'ADMINS') ||
                                 roleConfig.memberHasRole(member, 'MODERATORS') ||
                                 roleConfig.memberHasRole(member, 'HELPERS');
            
            if (!hasPermission) {
                throw new Error('You do not have permission to invite users to this voice channel.');
            }
        }

        // Get the target user member object
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
            throw new Error('Could not find the user to invite. They may have left the server.');
        }

        // Check if target user is already in the voice channel
        if (targetMember.voice.channelId === voiceChannel.id) {
            throw new Error('That user is already in your voice channel.');
        }

        // Check if target user has the "No VC" role
        const noVcRoleId = roleConfig.getId('NO_VCS');
        const targetHasNoVcRole = noVcRoleId && targetMember.roles.cache.has(noVcRoleId);
        
        if (targetHasNoVcRole) {
            throw new Error('That user cannot be invited to voice channels due to restrictions.');
        }
        
        return { targetUser, voiceChannel };
    }

    async executeCommand(interaction) {
        const { targetUser, voiceChannel } = await this.validateInput(interaction);
        
        // Create interactive invitation
        const result = await createVoiceInvitation(interaction, targetUser.id, voiceChannel);
        
        return {
            success: result.success,
            message: result.message
        };
    }

    async sendResponse(interaction, result) {
        await interaction.followUp({
            content: result.message,
            flags: ['Ephemeral']
        });
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

module.exports = new InviteCommand(); 
