const { Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const channelConfig = require('../config/channels');

// Store pending invitations: invitationId -> { inviter, invitee, voiceChannel, timeout, messageId }
const pendingInvitations = new Collection();

/**
 * Generate a unique invitation ID
 * @returns {string} - Unique invitation ID
 */
function generateInvitationId() {
    return `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a voice channel invitation with interactive buttons
 * @param {Object} interaction - Discord interaction object
 * @param {string} targetUserId - ID of user to invite
 * @param {Object} voiceChannel - Voice channel to invite to
 * @returns {Promise<Object>} - Result object
 */
async function createVoiceInvitation(interaction, targetUserId, voiceChannel) {
    try {
        const inviter = interaction.member;
        const guild = interaction.guild;
        
        // Get target user
        const targetUser = await guild.members.fetch(targetUserId).catch(() => null);
        if (!targetUser) {
            return { 
                success: false, 
                message: 'Could not find the user to invite. They may have left the server.' 
            };
        }

        // Get bot commands channel
        const botCommandsChannel = guild.channels.cache.get(channelConfig.getId('BOT_COMMANDS'));
        if (!botCommandsChannel) {
            return { 
                success: false, 
                message: 'Bot commands channel not found. Please contact an administrator.' 
            };
        }

        // Check if user already has a pending invitation
        const existingInvite = pendingInvitations.find(inv => 
            inv.invitee.id === targetUserId && inv.voiceChannel.id === voiceChannel.id
        );
        
        if (existingInvite) {
            return { 
                success: false, 
                message: 'That user already has a pending invitation to this voice channel.' 
            };
        }

        // Generate invitation ID
        const invitationId = generateInvitationId();

        // Create invitation embed
        const inviteEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('🎤 Voice Channel Invitation')
            .setDescription(`**${inviter.user.username}** has invited **${targetUser.user.username}** to join their voice channel!`)
            .addFields(
                { name: 'Voice Channel', value: `🔊 ${voiceChannel.name}`, inline: true },
                { name: 'Current Users', value: `👥 ${voiceChannel.members.size}/${voiceChannel.userLimit || '∞'}`, inline: true },
                { name: 'Invited User', value: `${targetUser}`, inline: true }
            )
            .addFields({
                name: 'How it works:',
                value: '• Click **Accept** to join the voice channel\n• If the channel is full, you\'ll get temporary access\n• **Join any voice channel** and you\'ll be **auto-moved**\n• You have **5 minutes** to respond',
                inline: false
            })
            .setFooter({ text: 'This invitation will expire in 5 minutes' })
            .setTimestamp();

        // Create buttons
        const acceptButton = new ButtonBuilder()
            .setCustomId(`accept_invite_${invitationId}`)
            .setLabel('Accept Invitation')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅');

        const declineButton = new ButtonBuilder()
            .setCustomId(`decline_invite_${invitationId}`)
            .setLabel('Decline')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌');

        const row = new ActionRowBuilder()
            .addComponents(acceptButton, declineButton);

        // Send invitation message with ping
        const inviteMessage = await botCommandsChannel.send({
            content: `${targetUser} 🔔 You've been invited to a voice channel!`,
            embeds: [inviteEmbed],
            components: [row]
        });

        // Set up timeout (5 minutes)
        const timeout = setTimeout(async () => {
            await expireInvitation(invitationId, guild);
        }, 5 * 60 * 1000);

        // Store invitation data
        pendingInvitations.set(invitationId, {
            inviter: inviter,
            invitee: targetUser,
            voiceChannel: voiceChannel,
            timeout: timeout,
            messageId: inviteMessage.id,
            channelId: botCommandsChannel.id,
            createdAt: Date.now()
        });

        return { 
            success: true, 
            message: `Invitation sent to ${targetUser.user.username}! They can accept it in ${botCommandsChannel}.` 
        };

    } catch (error) {
        console.error('[InvitationService] Error creating voice invitation:', error);
        return { 
            success: false, 
            message: 'An error occurred while creating the invitation. Please try again.' 
        };
    }
}

/**
 * Handle invitation acceptance
 * @param {Object} interaction - Button interaction
 * @param {string} invitationId - ID of the invitation
 * @returns {Promise<void>}
 */
async function handleInvitationAccept(interaction, invitationId) {
    try {
        await interaction.deferUpdate();

        const invitation = pendingInvitations.get(invitationId);
        if (!invitation) {
            return interaction.followUp({ 
                content: 'This invitation has expired or is no longer valid.', 
                flags: ['Ephemeral'] 
            });
        }

        // Verify the user accepting is the invited user
        if (interaction.user.id !== invitation.invitee.id) {
            return interaction.followUp({ 
                content: 'You are not the intended recipient of this invitation.', 
                flags: ['Ephemeral'] 
            });
        }

        // Grant user permission to connect to the voice channel
        await invitation.voiceChannel.permissionOverwrites.create(invitation.invitee.id, {
            Connect: true,
            Speak: true
        });

        // Check if user is currently in a voice channel
        const currentVoiceChannel = invitation.invitee.voice.channel;
        
        if (currentVoiceChannel) {
            // Auto-move user to the target voice channel
            try {
                await invitation.invitee.voice.setChannel(invitation.voiceChannel);
                
                // Update the invitation message to show success
                const successEmbed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('✅ Invitation Accepted!')
                    .setDescription(`**${invitation.invitee.user.username}** has been moved to **${invitation.voiceChannel.name}**`)
                    .setTimestamp();

                await interaction.editReply({
                    embeds: [successEmbed],
                    components: []
                });

                // Auto-delete the invitation message after 3 seconds
                setTimeout(async () => {
                    try {
                        await interaction.deleteReply();
                    } catch (deleteError) {
                        console.log('[InvitationService] Could not delete accepted invitation message');
                    }
                }, 3000);

                // Clean up invitation
                cleanupInvitation(invitationId);

                return;
            } catch (moveError) {
                console.error('[InvitationService] Error moving user:', moveError);
            }
        }

        // If user is not in voice or moving failed, provide instructions
        const instructionEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ Invitation Accepted!')
            .setDescription(`**${invitation.invitee.user.username}** has accepted the invitation!`)
            .addFields({
                name: '🎯 Auto-Move Instructions:',
                value: `**Join ANY voice channel** (waiting room, any VC, etc.) and you'll be **automatically moved** to **${invitation.voiceChannel.name}**!\n\n💡 *This bypasses channel limits and works from any voice channel*\n\nOr click here to join directly: <https://discord.com/channels/${interaction.guild.id}/${invitation.voiceChannel.id}>`,
                inline: false
            })
            .setTimestamp();

        await interaction.editReply({
            embeds: [instructionEmbed],
            components: []
        });

        // Auto-delete the instruction message after 10 seconds (gives time to read)
        setTimeout(async () => {
            try {
                await interaction.deleteReply();
            } catch (deleteError) {
                console.log('[InvitationService] Could not delete accepted invitation instructions');
            }
        }, 10000);

        // Send a direct ping to the invited user about auto-move
        try {
            await invitation.invitee.send({
                content: `🎯 **Auto-Move Enabled!** Join any voice channel in **${interaction.guild.name}** and you'll be automatically moved to **${invitation.voiceChannel.name}**!`
            });
        } catch (dmError) {
            // If DM fails, that's okay - they still have the channel message
            console.log('[InvitationService] Could not DM user about auto-move instructions');
        }

        // Set up auto-drag listener for when user joins any voice channel
        setupAutoMoveListener(invitation);

    } catch (error) {
        console.error('[InvitationService] Error handling invitation accept:', error);
        await interaction.followUp({ 
            content: 'An error occurred while processing your acceptance.', 
            flags: ['Ephemeral'] 
        });
    }
}

/**
 * Handle invitation decline
 * @param {Object} interaction - Button interaction
 * @param {string} invitationId - ID of the invitation
 * @returns {Promise<void>}
 */
async function handleInvitationDecline(interaction, invitationId) {
    try {
        await interaction.deferUpdate();

        const invitation = pendingInvitations.get(invitationId);
        if (!invitation) {
            return interaction.followUp({ 
                content: 'This invitation has expired or is no longer valid.', 
                flags: ['Ephemeral'] 
            });
        }

        // Verify the user declining is the invited user
        if (interaction.user.id !== invitation.invitee.id) {
            return interaction.followUp({ 
                content: 'You are not the intended recipient of this invitation.', 
                flags: ['Ephemeral'] 
            });
        }

        // Update the invitation message to show decline
        const declineEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Invitation Declined')
            .setDescription(`**${invitation.invitee.user.username}** has declined the invitation to **${invitation.voiceChannel.name}**`)
            .setTimestamp();

        await interaction.editReply({
            embeds: [declineEmbed],
            components: []
        });

        // Auto-delete the decline message after 1 minute
        setTimeout(async () => {
            try {
                await interaction.deleteReply();
            } catch (deleteError) {
                console.log('[InvitationService] Could not delete declined invitation message');
            }
        }, 60000);

        // Clean up invitation
        cleanupInvitation(invitationId);

    } catch (error) {
        console.error('[InvitationService] Error handling invitation decline:', error);
        await interaction.followUp({ 
            content: 'An error occurred while processing your decline.', 
            flags: ['Ephemeral'] 
        });
    }
}

/**
 * Set up auto-move listener for accepted invitations
 * @param {Object} invitation - Invitation data
 */
function setupAutoMoveListener(invitation) {
    const listenerId = `auto_move_${invitation.invitee.id}_${invitation.voiceChannel.id}`;
    
    // Set up a timeout to clean up the listener after 10 minutes
    const listenerTimeout = setTimeout(() => {
        cleanupInvitation(invitation.invitationId);
    }, 10 * 60 * 1000);

    // Store the auto-move data
    invitation.autoMoveTimeout = listenerTimeout;
    invitation.autoMoveActive = true;
}

/**
 * Handle auto-move when user joins a voice channel (called from voiceStateUpdate event)
 * @param {Object} member - Guild member
 * @param {Object} newChannel - New voice channel
 */
async function handleAutoMove(member, newChannel) {
    try {
        // Find any pending invitations for this user that have auto-move active
        const activeInvitation = pendingInvitations.find(inv => 
            inv.invitee.id === member.id && 
            inv.autoMoveActive && 
            newChannel && 
            newChannel.id !== inv.voiceChannel.id
        );

        if (activeInvitation) {
            // Auto-move user to the invited voice channel
            await member.voice.setChannel(activeInvitation.voiceChannel);
            
            // Send confirmation message
            const botCommandsChannel = member.guild.channels.cache.get(channelConfig.getId('BOT_COMMANDS'));
            if (botCommandsChannel) {
                const autoMoveEmbed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('🎯 Auto-Move Successful!')
                    .setDescription(`**${member.user.username}** joined a voice channel and was **automatically moved** to **${activeInvitation.voiceChannel.name}**! 🚀`)
                    .addFields({
                        name: 'Invitation Details:',
                        value: `Invited by: **${activeInvitation.inviter.user.username}**\nMoved from: **${newChannel.name}** → **${activeInvitation.voiceChannel.name}**`,
                        inline: false
                    })
                    .setTimestamp();

                const moveMessage = await botCommandsChannel.send({ embeds: [autoMoveEmbed] });
                
                // Auto-delete the auto-move success message after 1 minute
                setTimeout(async () => {
                    try {
                        await moveMessage.delete();
                    } catch (deleteError) {
                        console.log('[InvitationService] Could not delete auto-move success message');
                    }
                }, 60000);
            }

            // Also DM the user to confirm the move
            try {
                await member.send({
                    content: `🎯 **Success!** You've been automatically moved to **${activeInvitation.voiceChannel.name}** as requested! Welcome to the voice channel! 🎉`
                });
            } catch (dmError) {
                // If DM fails, that's okay - they got moved successfully
                console.log('[InvitationService] Could not DM user about successful auto-move');
            }

            // Clean up the invitation
            cleanupInvitation(Array.from(pendingInvitations.entries()).find(([id, inv]) => inv === activeInvitation)?.[0]);
        }
    } catch (error) {
        console.error('[InvitationService] Error handling auto-move:', error);
    }
}

/**
 * Expire an invitation
 * @param {string} invitationId - ID of invitation to expire
 * @param {Object} guild - Discord guild
 */
async function expireInvitation(invitationId, guild) {
    try {
        const invitation = pendingInvitations.get(invitationId);
        if (!invitation) return;

        // Delete the expired invitation message to keep channel clean
        const channel = guild.channels.cache.get(invitation.channelId);
        if (channel) {
            try {
                const message = await channel.messages.fetch(invitation.messageId);
                
                // Show expiration briefly, then delete
                const expiredEmbed = new EmbedBuilder()
                    .setColor(0x808080)
                    .setTitle('⏰ Invitation Expired')
                    .setDescription(`The voice channel invitation for **${invitation.invitee.user.username}** has expired.`)
                    .setTimestamp();

                await message.edit({
                    embeds: [expiredEmbed],
                    components: []
                });

                // Auto-delete the expired message after 3 seconds
                setTimeout(async () => {
                    try {
                        await message.delete();
                    } catch (deleteError) {
                        console.log('[InvitationService] Could not delete expired invitation message');
                    }
                }, 3000);

            } catch (messageError) {
                console.error('[InvitationService] Error handling expired message:', messageError);
            }
        }

        // Clean up invitation
        cleanupInvitation(invitationId);

    } catch (error) {
        console.error('[InvitationService] Error expiring invitation:', error);
    }
}

/**
 * Clean up invitation data
 * @param {string} invitationId - ID of invitation to clean up
 */
function cleanupInvitation(invitationId) {
    const invitation = pendingInvitations.get(invitationId);
    if (invitation) {
        // Clear timeouts
        if (invitation.timeout) {
            clearTimeout(invitation.timeout);
        }
        if (invitation.autoMoveTimeout) {
            clearTimeout(invitation.autoMoveTimeout);
        }
        
        // Remove from collection
        pendingInvitations.delete(invitationId);
    }
}

/**
 * Get pending invitations for debugging
 * @returns {Collection} - Collection of pending invitations
 */
function getPendingInvitations() {
    return pendingInvitations;
}

module.exports = {
    createVoiceInvitation,
    handleInvitationAccept,
    handleInvitationDecline,
    handleAutoMove,
    expireInvitation,
    cleanupInvitation,
    getPendingInvitations
}; 