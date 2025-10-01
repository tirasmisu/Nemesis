const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits } = require('discord.js');
const { createVoiceInvitation } = require('../services/invitationService');
const { isUserCreatedChannel, getChannelCreator } = require('../services/voiceChannelService');
const roleConfig = require('../config/roles');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Invite to Voice Channel')
        .setType(ApplicationCommandType.User),
    
    async execute(interaction) {
        try {
            await interaction.deferReply({ flags: ['Ephemeral'] });
            
            const targetUser = interaction.targetUser;
            const targetMember = interaction.targetMember;
            const member = interaction.member;
            
            // Basic validation
            if (!targetUser) {
                return interaction.editReply({
                    content: 'Could not find the user to invite.'
                });
            }
            
            if (targetUser.id === interaction.user.id) {
                return interaction.editReply({
                    content: 'You cannot invite yourself to your voice channel.'
                });
            }
            
            if (targetUser.bot) {
                return interaction.editReply({
                    content: 'You cannot invite bots to your voice channel.'
                });
            }
            
            if (!targetMember) {
                return interaction.editReply({
                    content: 'That user is not in this server.'
                });
            }

            // Check if the member is in a voice channel
            if (!member.voice.channel) {
                return interaction.editReply({
                    content: 'You need to be in a voice channel to invite someone.'
                });
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
                    return interaction.editReply({
                        content: 'Only the channel creator or staff can invite others to this voice channel.'
                    });
                }
            } else {
                // If it's not a created channel, check if user has permission to manage channels
                const hasPermission = member.permissions.has(PermissionFlagsBits.ManageChannels) || 
                                     isStaff ||
                                     roleConfig.memberHasRole(member, 'ADMINS') ||
                                     roleConfig.memberHasRole(member, 'MODERATORS') ||
                                     roleConfig.memberHasRole(member, 'HELPERS');
                
                if (!hasPermission) {
                    return interaction.editReply({
                        content: 'You do not have permission to invite users to this voice channel.'
                    });
                }
            }

            // Check if target user is already in the voice channel
            if (targetMember.voice.channelId === voiceChannel.id) {
                return interaction.editReply({
                    content: 'That user is already in your voice channel.'
                });
            }

            // Check if target user has the "No VC" role
            const noVcRoleId = roleConfig.getId('NO_VCS');
            const targetHasNoVcRole = noVcRoleId && targetMember.roles.cache.has(noVcRoleId);
            
            if (targetHasNoVcRole) {
                return interaction.editReply({
                    content: 'That user cannot be invited to voice channels due to restrictions.'
                });
            }
            
            // Create interactive invitation
            const result = await createVoiceInvitation(interaction, targetUser.id, voiceChannel);
            
            await interaction.editReply({
                content: result.message
            });
            
        } catch (error) {
            console.error('Error in Invite to Voice Channel context menu:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred while processing your request.', 
                    flags: ['Ephemeral'] 
                });
            } else if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ 
                    content: 'An error occurred while processing your request.' 
                });
            }
        }
    }
}; 