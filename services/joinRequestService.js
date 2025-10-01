const { Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const channelConfig = require('../config/channels');
const { isUserCreatedChannel, getChannelCreator } = require('./voiceChannelService');
const roleConfig = require('../config/roles');

// Store pending join requests: requestId -> { requester, targetUser, voiceChannel, timeout, messageId }
const pendingJoinRequests = new Collection();

/**
 * Generate a unique join request ID
 * @returns {string} - Unique join request ID
 */
function generateJoinRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a voice channel join request with interactive buttons
 * @param {Object} interaction - Discord interaction object
 * @param {string} targetUserId - ID of user whose voice channel to request to join
 * @returns {Promise<Object>} - Result object
 */
async function createJoinRequest(interaction, targetUserId) {
    try {
        const requester = interaction.member;
        const guild = interaction.guild;
        
        // Get target user
        const targetUser = await guild.members.fetch(targetUserId).catch(() => null);
        if (!targetUser) {
            return { 
                success: false, 
                message: 'Could not find the user. They may have left the server.' 
            };
        }

        // Check if target user is in a voice channel
        if (!targetUser.voice.channel) {
            return { 
                success: false, 
                message: `${targetUser.user.username} is not currently in a voice channel.` 
            };
        }

        const voiceChannel = targetUser.voice.channel;

        // Check if requester is already in the same voice channel
        if (requester.voice.channelId === voiceChannel.id) {
            return { 
                success: false, 
                message: 'You are already in that voice channel.' 
            };
        }

        // Check if requester has the "No VC" role
        const noVcRoleId = roleConfig.getId('NO_VCS');
        const requesterHasNoVcRole = noVcRoleId && requester.roles.cache.has(noVcRoleId);
        
        if (requesterHasNoVcRole) {
            return { 
                success: false, 
                message: 'You cannot join voice channels due to restrictions.' 
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

        // Check if user already has a pending join request for this channel
        const existingRequest = pendingJoinRequests.find(req => 
            req.requester.id === requester.id && req.voiceChannel.id === voiceChannel.id
        );
        
        if (existingRequest) {
            return { 
                success: false, 
                message: 'You already have a pending join request for this voice channel.' 
            };
        }

        // Generate request ID
        const requestId = generateJoinRequestId();

        // Determine who can approve the request
        const isCreatedChannel = isUserCreatedChannel(voiceChannel.id);
        let approvers = [];
        
        if (isCreatedChannel) {
            const channelCreatorId = getChannelCreator(voiceChannel.id);
            const channelCreator = await guild.members.fetch(channelCreatorId).catch(() => null);
            if (channelCreator) {
                approvers.push(channelCreator.user.username);
            }
        } else {
            // For non-created channels, staff can approve
            approvers.push('Staff members');
        }

        // Add the target user as an approver (person in the channel)
        if (!approvers.some(approver => approver === targetUser.user.username)) {
            approvers.unshift(targetUser.user.username);
        }

        // Create join request embed
        const requestEmbed = new EmbedBuilder()
            .setColor(0xFF9500)
            .setTitle('🚪 Voice Channel Join Request')
            .setDescription(`**${requester.user.username}** wants to join **${targetUser.user.username}**'s voice channel!`)
            .addFields(
                { name: 'Voice Channel', value: `🔊 ${voiceChannel.name}`, inline: true },
                { name: 'Current Users', value: `👥 ${voiceChannel.members.size}/${voiceChannel.userLimit || '∞'}`, inline: true },
                { name: 'Requesting User', value: `${requester}`, inline: true }
            )
            .addFields({
                name: 'Who can approve:',
                value: `• ${approvers.join('\n• ')}\n• **Staff members**`,
                inline: false
            })
            .addFields({
                name: 'How it works:',
                value: '• Click **Accept** to allow them to join\n• If the channel is full, they\'ll get temporary access\n• They can join any voice channel and get **auto-moved**\n• Request expires in **5 minutes**',
                inline: false
            })
            .setThumbnail(requester.user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: 'This request will expire in 5 minutes' })
            .setTimestamp();

        // Create buttons
        const acceptButton = new ButtonBuilder()
            .setCustomId(`accept_join_${requestId}`)
            .setLabel('Accept Request')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅');

        const declineButton = new ButtonBuilder()
            .setCustomId(`decline_join_${requestId}`)
            .setLabel('Decline')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌');

        const row = new ActionRowBuilder()
            .addComponents(acceptButton, declineButton);

        // Send join request message with ping to target user
        const requestMessage = await botCommandsChannel.send({
            content: `${targetUser} 🔔 Someone wants to join your voice channel!`,
            embeds: [requestEmbed],
            components: [row]
        });

        // Set up timeout (5 minutes)
        const timeout = setTimeout(async () => {
            await expireJoinRequest(requestId, guild);
        }, 5 * 60 * 1000);

        // Store request data
        pendingJoinRequests.set(requestId, {
            requester: requester,
            targetUser: targetUser,
            voiceChannel: voiceChannel,
            timeout: timeout,
            messageId: requestMessage.id,
            channelId: botCommandsChannel.id,
            createdAt: Date.now(),
            approvers: approvers
        });

        return { 
            success: true, 
            message: `Join request sent to ${targetUser.user.username}! They can respond in ${botCommandsChannel}.` 
        };

    } catch (error) {
        console.error('[JoinRequestService] Error creating join request:', error);
        return { 
            success: false, 
            message: 'An error occurred while creating the join request. Please try again.' 
        };
    }
}

/**
 * Handle join request acceptance
 * @param {Object} interaction - Button interaction
 * @param {string} requestId - ID of the join request
 * @returns {Promise<void>}
 */
async function handleJoinRequestAccept(interaction, requestId) {
    try {
        await interaction.deferUpdate();

        const request = pendingJoinRequests.get(requestId);
        if (!request) {
            return interaction.followUp({ 
                content: 'This join request has expired or is no longer valid.', 
                flags: ['Ephemeral'] 
            });
        }

        // Check if the user accepting has permission
        const member = interaction.member;
        const canApprove = await canUserApproveJoinRequest(member, request);
        
        if (!canApprove) {
            return interaction.followUp({ 
                content: 'You do not have permission to approve this join request.', 
                flags: ['Ephemeral'] 
            });
        }

        // Grant requester permission to connect to the voice channel
        await request.voiceChannel.permissionOverwrites.create(request.requester.id, {
            Connect: true,
            Speak: true
        });

        // Check if requester is currently in a voice channel
        const currentVoiceChannel = request.requester.voice.channel;
        
        if (currentVoiceChannel) {
            // Auto-move requester to the target voice channel
            try {
                await request.requester.voice.setChannel(request.voiceChannel);
                
                // Update the request message to show success
                const successEmbed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('✅ Join Request Accepted!')
                    .setDescription(`**${request.requester.user.username}** has been moved to **${request.voiceChannel.name}**`)
                    .addFields({
                        name: 'Approved by:',
                        value: `${member.user.username}`,
                        inline: true
                    })
                    .setTimestamp();

                await interaction.editReply({
                    embeds: [successEmbed],
                    components: []
                });

                // Auto-delete the message after 3 seconds
                setTimeout(async () => {
                    try {
                        await interaction.deleteReply();
                    } catch (deleteError) {
                        console.log('[JoinRequestService] Could not delete accepted join request message');
                    }
                }, 3000);

                // Clean up request
                cleanupJoinRequest(requestId);

                return;
            } catch (moveError) {
                console.error('[JoinRequestService] Error moving user:', moveError);
            }
        }

        // If requester is not in voice or moving failed, provide instructions
        const instructionEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ Join Request Accepted!')
            .setDescription(`**${request.requester.user.username}**'s request has been approved!`)
            .addFields({
                name: '🎯 Auto-Move Instructions:',
                value: `**Join ANY voice channel** and you'll be **automatically moved** to **${request.voiceChannel.name}**!\n\n💡 *This bypasses channel limits and works from any voice channel*\n\nOr click here to join directly: <https://discord.com/channels/${interaction.guild.id}/${request.voiceChannel.id}>`,
                inline: false
            })
            .addFields({
                name: 'Approved by:',
                value: `${member.user.username}`,
                inline: true
            })
            .setTimestamp();

        await interaction.editReply({
            embeds: [instructionEmbed],
            components: []
        });

        // Auto-delete the instruction message after 10 seconds
        setTimeout(async () => {
            try {
                await interaction.deleteReply();
            } catch (deleteError) {
                console.log('[JoinRequestService] Could not delete accepted join request instructions');
            }
        }, 10000);

        // Send DM to requester
        try {
            await request.requester.send({
                content: `🎯 **Join Request Approved!** Your request to join **${request.voiceChannel.name}** has been approved by **${member.user.username}**! Join any voice channel to be auto-moved there!`
            });
        } catch (dmError) {
            console.log('[JoinRequestService] Could not DM requester about approval');
        }

        // Set up auto-move listener
        setupAutoMoveListener(request);

    } catch (error) {
        console.error('[JoinRequestService] Error handling join request accept:', error);
        await interaction.followUp({ 
            content: 'An error occurred while processing the acceptance.', 
            flags: ['Ephemeral'] 
        });
    }
}

/**
 * Handle join request decline
 * @param {Object} interaction - Button interaction
 * @param {string} requestId - ID of the join request
 * @returns {Promise<void>}
 */
async function handleJoinRequestDecline(interaction, requestId) {
    try {
        await interaction.deferUpdate();

        const request = pendingJoinRequests.get(requestId);
        if (!request) {
            return interaction.followUp({ 
                content: 'This join request has expired or is no longer valid.', 
                flags: ['Ephemeral'] 
            });
        }

        // Check if the user declining has permission
        const member = interaction.member;
        const canApprove = await canUserApproveJoinRequest(member, request);
        
        if (!canApprove) {
            return interaction.followUp({ 
                content: 'You do not have permission to decline this join request.', 
                flags: ['Ephemeral'] 
            });
        }

        // Update the request message to show decline
        const declineEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Join Request Declined')
            .setDescription(`**${request.requester.user.username}**'s request to join **${request.voiceChannel.name}** has been declined`)
            .addFields({
                name: 'Declined by:',
                value: `${member.user.username}`,
                inline: true
            })
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
                console.log('[JoinRequestService] Could not delete declined join request message');
            }
        }, 60000);

        // Send DM to requester
        try {
            await request.requester.send({
                content: `❌ Your request to join **${request.voiceChannel.name}** has been declined by **${member.user.username}**.`
            });
        } catch (dmError) {
            console.log('[JoinRequestService] Could not DM requester about decline');
        }

        // Clean up request
        cleanupJoinRequest(requestId);

    } catch (error) {
        console.error('[JoinRequestService] Error handling join request decline:', error);
        await interaction.followUp({ 
            content: 'An error occurred while processing the decline.', 
            flags: ['Ephemeral'] 
        });
    }
}

/**
 * Check if a user can approve a join request
 * @param {Object} member - Guild member trying to approve
 * @param {Object} request - Join request data
 * @returns {Promise<boolean>} - Whether user can approve
 */
async function canUserApproveJoinRequest(member, request) {
    // Check if user is the target user (person being requested to join)
    if (member.id === request.targetUser.id) {
        return true;
    }

    // Check if user is the channel creator (for created channels)
    const isCreatedChannel = isUserCreatedChannel(request.voiceChannel.id);
    if (isCreatedChannel) {
        const channelCreatorId = getChannelCreator(request.voiceChannel.id);
        if (member.id === channelCreatorId) {
            return true;
        }
    }

    // Check if user is staff
    const staffRole = member.guild.roles.cache.get(roleConfig.getId('STAFF'));
    const isStaff = staffRole && member.roles.cache.has(staffRole.id);
    
    if (isStaff || 
        roleConfig.memberHasRole(member, 'ADMINS') ||
        roleConfig.memberHasRole(member, 'MODERATORS') ||
        roleConfig.memberHasRole(member, 'HELPERS')) {
        return true;
    }

    return false;
}

/**
 * Set up auto-move listener for approved join requests
 * @param {Object} request - Join request data
 */
function setupAutoMoveListener(request) {
    // Set up a timeout to clean up the listener after 10 minutes
    const listenerTimeout = setTimeout(() => {
        cleanupJoinRequest(request.requestId);
    }, 10 * 60 * 1000);

    // Store the auto-move data
    request.autoMoveTimeout = listenerTimeout;
    request.autoMoveActive = true;
}

/**
 * Handle auto-move when requester joins a voice channel (called from voiceStateUpdate event)
 * @param {Object} member - Guild member
 * @param {Object} newChannel - New voice channel
 */
async function handleJoinRequestAutoMove(member, newChannel) {
    try {
        // Find any pending join requests for this user that have auto-move active
        const activeRequest = pendingJoinRequests.find(req => 
            req.requester.id === member.id && 
            req.autoMoveActive && 
            newChannel && 
            newChannel.id !== req.voiceChannel.id
        );

        if (activeRequest) {
            // Auto-move user to the requested voice channel
            await member.voice.setChannel(activeRequest.voiceChannel);
            
            // Send confirmation message
            const botCommandsChannel = member.guild.channels.cache.get(channelConfig.getId('BOT_COMMANDS'));
            if (botCommandsChannel) {
                const autoMoveEmbed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('🎯 Auto-Move Successful!')
                    .setDescription(`**${member.user.username}** joined a voice channel and was **automatically moved** to **${activeRequest.voiceChannel.name}**! 🚀`)
                    .addFields({
                        name: 'Join Request Details:',
                        value: `Requested to join: **${activeRequest.targetUser.user.username}**'s channel\nMoved from: **${newChannel.name}** → **${activeRequest.voiceChannel.name}**`,
                        inline: false
                    })
                    .setTimestamp();

                const moveMessage = await botCommandsChannel.send({ embeds: [autoMoveEmbed] });
                
                // Auto-delete the auto-move success message after 1 minute
                setTimeout(async () => {
                    try {
                        await moveMessage.delete();
                    } catch (deleteError) {
                        console.log('[JoinRequestService] Could not delete auto-move success message');
                    }
                }, 60000);
            }

            // Also DM the user to confirm the move
            try {
                await member.send({
                    content: `🎯 **Success!** You've been automatically moved to **${activeRequest.voiceChannel.name}** as requested! Welcome to the voice channel! 🎉`
                });
            } catch (dmError) {
                console.log('[JoinRequestService] Could not DM user about successful auto-move');
            }

            // Clean up the request
            cleanupJoinRequest(Array.from(pendingJoinRequests.entries()).find(([id, req]) => req === activeRequest)?.[0]);
        }
    } catch (error) {
        console.error('[JoinRequestService] Error handling auto-move:', error);
    }
}

/**
 * Expire a join request
 * @param {string} requestId - ID of request to expire
 * @param {Object} guild - Discord guild
 */
async function expireJoinRequest(requestId, guild) {
    try {
        const request = pendingJoinRequests.get(requestId);
        if (!request) return;

        // Delete the expired request message to keep channel clean
        const channel = guild.channels.cache.get(request.channelId);
        if (channel) {
            try {
                const message = await channel.messages.fetch(request.messageId);
                
                // Show expiration briefly, then delete
                const expiredEmbed = new EmbedBuilder()
                    .setColor(0x808080)
                    .setTitle('⏰ Join Request Expired')
                    .setDescription(`The join request from **${request.requester.user.username}** has expired.`)
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
                        console.log('[JoinRequestService] Could not delete expired join request message');
                    }
                }, 3000);

            } catch (messageError) {
                console.error('[JoinRequestService] Error handling expired message:', messageError);
            }
        }

        // Clean up request
        cleanupJoinRequest(requestId);

    } catch (error) {
        console.error('[JoinRequestService] Error expiring join request:', error);
    }
}

/**
 * Clean up join request data
 * @param {string} requestId - ID of request to clean up
 */
function cleanupJoinRequest(requestId) {
    const request = pendingJoinRequests.get(requestId);
    if (request) {
        // Clear timeouts
        if (request.timeout) {
            clearTimeout(request.timeout);
        }
        if (request.autoMoveTimeout) {
            clearTimeout(request.autoMoveTimeout);
        }
        
        // Remove from collection
        pendingJoinRequests.delete(requestId);
    }
}

/**
 * Get pending join requests for debugging
 * @returns {Collection} - Collection of pending join requests
 */
function getPendingJoinRequests() {
    return pendingJoinRequests;
}

module.exports = {
    createJoinRequest,
    handleJoinRequestAccept,
    handleJoinRequestDecline,
    handleJoinRequestAutoMove,
    expireJoinRequest,
    cleanupJoinRequest,
    getPendingJoinRequests
}; 