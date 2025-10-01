const { Collection, PermissionFlagsBits } = require('discord.js');
const voiceConfig = require('../config/voiceChannels');

// Track created voice channels and their creators
// Map structure: channelId -> { creatorId, createdAt, timeout }
const createdChannels = new Collection();

/**
 * Handle user joining a Join to Create channel
 * @param {Object} member - The guild member who joined
 * @param {Object} channel - The voice channel they joined
 * @param {Object} client - Discord client instance
 * @returns {Promise<Object|null>} - The created channel or null if failed
 */
async function handleJoinToCreate(member, channel, client) {
    try {
        // Check if the channel is the Join to Create channel
        if (channel.id !== voiceConfig.joinToCreate.channelId) return null;
        
        // Get the staff role using role config
        const roleConfig = require('../config/roles');
        const staffRole = member.guild.roles.cache.get(roleConfig.getId('STAFF'));
        
        // Check if user has Nitro role if required
        if (voiceConfig.joinToCreate.nitroRoleId) {
            const hasNitro = member.roles.cache.has(voiceConfig.joinToCreate.nitroRoleId);
            const isStaff = staffRole && member.roles.cache.has(staffRole.id);
            const isFriend = roleConfig.memberHasRole(member, 'FRIENDS');
            
            // Allow staff and friends to bypass the Nitro requirement
            if (!hasNitro && !isStaff && !isFriend) {
                // Try to send them a message about needing Nitro or Friends role
                try {
                    await member.send('You need Discord Nitro or the Friends role to create a voice channel. Please contact staff if you believe this is an error.');
                } catch (dmError) {
                    console.error(`[VoiceChannel] Couldn't DM user ${member.id} about Nitro/Friends requirement`);
                }
                
                // Disconnect them from the voice channel
                await member.voice.disconnect('No Nitro or Friends role for Join to Create');
                return null;
            }
        }
        
        // Get the category for the new channel
        const category = member.guild.channels.cache.get(voiceConfig.joinToCreate.categoryId);
        if (!category) {
            console.error('[VoiceChannel] Voice channel category not found');
            return null;
        }
        
        // Create channel name with the user's nickname or username if nickname is not set
        const displayName = member.nickname || member.user.username;
        const channelName = voiceConfig.joinToCreate.nameFormat.replace('{username}', displayName);
        
        // Check if user has the "No VC" role
        const noVcRoleId = roleConfig.getId('NO_VCS');
        const hasNoVcRole = noVcRoleId && member.roles.cache.has(noVcRoleId);
        
        // Create permission overwrites array
        const permissionOverwrites = [
            {
                id: member.guild.id, // @everyone role
                deny: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect]
            },
            {
                id: member.id, // Channel creator
                allow: hasNoVcRole ? 
                    [PermissionFlagsBits.MoveMembers, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers, PermissionFlagsBits.PrioritySpeaker] :
                    [PermissionFlagsBits.MoveMembers, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers, PermissionFlagsBits.PrioritySpeaker, PermissionFlagsBits.Connect],
                deny: hasNoVcRole ? [PermissionFlagsBits.Connect] : []
            },
            {
                id: client.user.id, // Bot
                allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.ManageChannels]
            }
        ];
        
        // Add staff role permission if it exists
        if (staffRole) {
            permissionOverwrites.push({
                id: staffRole.id, // Staff role
                allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.MoveMembers]
            });
        }
        
        // Add "No VC" role permission to deny connect for all users with this role
        if (noVcRoleId) {
            permissionOverwrites.push({
                id: noVcRoleId, // No VC role
                deny: [PermissionFlagsBits.Connect]
            });
        }
        
        // Calculate position for the new channel
        let targetPosition = undefined;
        if (voiceConfig.positioning && voiceConfig.positioning.enablePositioning) {
            targetPosition = await calculateChannelPosition(member.guild, category);
        }
        
        // Create the new voice channel (without position to avoid displacing existing channels)
        const newChannel = await member.guild.channels.create({
            name: channelName,
            type: 2, // Voice channel type
            parent: category.id,
            userLimit: voiceConfig.joinToCreate.defaultUserLimit,
            permissionOverwrites: permissionOverwrites
        });
        
        // Position the channel correctly after creation if positioning is enabled
        if (targetPosition !== undefined) {
            try {
                // Get the Join to Create channel to ensure we position below it
                const joinToCreateChannel = member.guild.channels.cache.get(voiceConfig.joinToCreate.channelId);
                if (joinToCreateChannel) {
                    // Position the new channel right after the Join to Create channel
                    await newChannel.setPosition(joinToCreateChannel.position + 1);
                    console.log(`[VoiceChannel] Positioned new channel "${channelName}" below Join to Create VC`);
                }
            } catch (positionError) {
                console.error('[VoiceChannel] Error positioning new channel:', positionError);
            }
        }
        
        // If user has "No VC" role, disconnect them immediately and send a message
        if (hasNoVcRole) {
            try {
                await member.send(`Your voice channel "${channelName}" has been created, but you cannot join it due to voice channel restrictions. You can still manage the channel and invite others using the \`/invite\` command.`);
            } catch (dmError) {
                console.error(`[VoiceChannel] Couldn't DM user ${member.id} about No VC restriction`);
            }
            
            // Disconnect them from the voice channel
            await member.voice.disconnect('User has No VC role');
            console.log(`[VoiceChannel] Created channel ${newChannel.name} for ${member.user.tag} but disconnected due to No VC role`);
        } else {
            // Move the member to the new channel
            await member.voice.setChannel(newChannel);
            console.log(`[VoiceChannel] Created channel ${newChannel.name} for ${member.user.tag}`);
        }
        
        // Store the created channel with creator info
        createdChannels.set(newChannel.id, {
            creatorId: member.id,
            createdAt: Date.now(),
            timeout: null
        });
        
        // Auto-positioning is no longer needed here since new channels are positioned correctly during creation
        // and it was causing the waiting room to move to the top temporarily
        
        return newChannel;
    } catch (error) {
        console.error('[VoiceChannel] Error creating voice channel:', error);
        return null;
    }
}

/**
 * Calculate the position for a new voice channel
 * @param {Object} guild - The guild object
 * @param {Object} category - The category where the channel will be created
 * @returns {Promise<number|undefined>} - The position for the new channel
 */
async function calculateChannelPosition(guild, category) {
    try {
        // Get the Join to Create channel
        const joinToCreateChannel = guild.channels.cache.get(voiceConfig.joinToCreate.channelId);
        if (!joinToCreateChannel) {
            console.warn('[VoiceChannel] Join to Create channel not found for positioning');
            return undefined;
        }
        
        // Get the waiting room channel if configured
        const waitingRoomChannelId = voiceConfig.positioning.waitingRoomChannelId;
        let waitingRoomChannel = null;
        
        if (waitingRoomChannelId) {
            waitingRoomChannel = guild.channels.cache.get(waitingRoomChannelId);
        }
        
        // If no waiting room channel specified, try to find one by name
        if (!waitingRoomChannel) {
            waitingRoomChannel = category.children.cache.find(channel => 
                channel.name.toLowerCase().includes('waiting') || 
                channel.name.toLowerCase().includes('wait')
            );
        }
        
        // Position new channels right after the Join to Create channel
        // This ensures order: Join to Create -> Custom Channels -> Waiting Room
        return joinToCreateChannel.position + 1;
    } catch (error) {
        console.error('[VoiceChannel] Error calculating channel position:', error);
        return undefined;
    }
}

/**
 * Handle a user leaving a voice channel
 * @param {Object} channel - The voice channel that was left
 * @param {Object} member - The member who left the channel
 */
async function handleChannelLeave(channel, member) {
    // Check if this is a created channel we're tracking
    if (!channel || !createdChannels.has(channel.id)) return;
    
    try {
        const channelData = createdChannels.get(channel.id);
        
        // If the creator left, delete the channel immediately
        if (member && channelData.creatorId === member.id) {
            await channel.delete('Creator left voice channel');
            createdChannels.delete(channel.id);
            console.log(`[VoiceChannel] Deleted channel ${channel.name} because creator left`);
            
            // Auto-positioning removed to prevent waiting room from jumping around
            
            return;
        }
        
        // If a non-creator user left, remove their permission to rejoin
        if (member) {
            await channel.permissionOverwrites.delete(member.id);
            console.log(`[VoiceChannel] Removed permissions for ${member.user.tag} from channel ${channel.name}`);
        }
        
        // If there are still members in the channel, do nothing else
        if (channel.members.size > 0) return;
        
        // Handle case when channel is empty but creator didn't leave (left previously)
        // Delete the channel immediately instead of using a timeout
        await channel.delete('Voice channel empty');
        createdChannels.delete(channel.id);
        console.log(`[VoiceChannel] Deleted empty channel ${channel.name}`);
        
        // Auto-positioning removed to prevent waiting room from jumping around
    } catch (error) {
        console.error('[VoiceChannel] Error handling channel leave:', error);
    }
}

/**
 * Handle a user joining an existing voice channel
 * @param {Object} channel - The voice channel that was joined
 */
async function handleChannelJoin(channel) {
    // Check if this is a created channel we're tracking
    if (!channel || !createdChannels.has(channel.id)) return;
    
    try {
        const channelData = createdChannels.get(channel.id);
        
        // If there's a pending deletion, cancel it
        if (channelData.timeout) {
            clearTimeout(channelData.timeout);
            channelData.timeout = null;
            createdChannels.set(channel.id, channelData);
            console.log(`[VoiceChannel] Cancelled deletion for channel ${channel.name}`);
        }
    } catch (error) {
        console.error('[VoiceChannel] Error handling channel join:', error);
    }
}

/**
 * Invite a user to a voice channel
 * @param {Object} interaction - The Discord interaction
 * @param {String} targetUserId - The ID of the user to invite
 * @returns {Promise<Object>} - Response object: { success, message }
 */
async function inviteToVoiceChannel(interaction, targetUserId) {
    try {
        const member = interaction.member;
        
        // Check if the member is in a voice channel
        if (!member.voice.channel) {
            return { 
                success: false, 
                message: 'You need to be in a voice channel to invite someone.' 
            };
        }
        
        const voiceChannel = member.voice.channel;
        
        // Check if this is a custom created channel
        const isCreatedChannel = createdChannels.has(voiceChannel.id);
        
        // Get the staff role using role config
        const roleConfig = require('../config/roles');
        const staffRole = interaction.guild.roles.cache.get(roleConfig.getId('STAFF'));
        const isStaff = staffRole && member.roles.cache.has(staffRole.id);
        
        // Check if member has permission to invite
        if (isCreatedChannel) {
            const channelData = createdChannels.get(voiceChannel.id);
            
            // Allow channel creator or staff to invite others
            if (channelData.creatorId !== member.id && !isStaff) {
                return { 
                    success: false, 
                    message: 'Only the channel creator or staff can invite others to this voice channel.' 
                };
            }
        } else {
            // If it's not a created channel, check if user has permission to manage channels
            const hasPermission = member.permissions.has(PermissionFlagsBits.ManageChannels) || 
                                 isStaff ||
                                 roleConfig.memberHasRole(member, 'ADMINS') ||
                                 roleConfig.memberHasRole(member, 'MODERATORS') ||
                                 roleConfig.memberHasRole(member, 'HELPERS');
            
            if (!hasPermission) {
                return { 
                    success: false, 
                    message: 'You do not have permission to invite users to this voice channel.' 
                };
            }
        }
        
        // Get the target user
        const targetUser = await interaction.guild.members.fetch(targetUserId).catch(() => null);
        if (!targetUser) {
            return { 
                success: false, 
                message: 'Could not find the user to invite. They may have left the server.' 
            };
        }
        
        // Check if target user is already in the voice channel
        if (targetUser.voice.channelId === voiceChannel.id) {
            return { 
                success: false, 
                message: 'That user is already in your voice channel.' 
            };
        }
        
        // Check if target user has the "No VC" role
        const noVcRoleId = roleConfig.getId('NO_VCS');
        const targetHasNoVcRole = noVcRoleId && targetUser.roles.cache.has(noVcRoleId);
        
        if (targetHasNoVcRole) {
            return { 
                success: false, 
                message: 'That user cannot be invited to voice channels due to restrictions.' 
            };
        }
        
        // Grant the target user permission to connect to the voice channel
        await voiceChannel.permissionOverwrites.create(targetUser.id, {
            Connect: true
        });
        
        // Send an invitation to the user
        await targetUser.send({
            content: `${member.user.username} has invited you to join their voice channel in **${interaction.guild.name}**!\nClick here to join: <https://discord.com/channels/${interaction.guild.id}/${voiceChannel.id}>`,
        }).catch(() => {
            // If we can't DM them, we'll just mention them in the channel
            return { 
                success: true, 
                message: `Invitation sent to ${targetUser}! (Could not DM them, mentioning in channel instead)` 
            };
        });
        
        return { 
            success: true, 
            message: `Invitation sent to ${targetUser.user.username}!` 
        };
    } catch (error) {
        console.error('[VoiceChannel] Error inviting user to voice channel:', error);
        return { 
            success: false, 
            message: 'An error occurred while sending the invitation. Please try again.' 
        };
    }
}

/**
 * Check if a channel is a user-created voice channel
 * @param {String} channelId - The channel ID to check
 * @returns {Boolean} - Whether the channel is user-created
 */
function isUserCreatedChannel(channelId) {
    return createdChannels.has(channelId);
}

/**
 * Get the creator of a voice channel
 * @param {String} channelId - The channel ID to check
 * @returns {String|null} - The creator's user ID or null
 */
function getChannelCreator(channelId) {
    const channelData = createdChannels.get(channelId);
    return channelData ? channelData.creatorId : null;
}

/**
 * Automatically position the Join to Create channel above custom channels and below waiting room
 * @param {Object} guild - The guild object
 */
async function autoPositionJoinToCreateChannel(guild) {
    try {
        // Get the Join to Create channel
        const joinToCreateChannel = guild.channels.cache.get(voiceConfig.joinToCreate.channelId);
        if (!joinToCreateChannel) {
            console.warn('[VoiceChannel] Join to Create channel not found for auto-positioning');
            return;
        }

        // Get the category
        const category = guild.channels.cache.get(voiceConfig.joinToCreate.categoryId);
        if (!category) {
            console.warn('[VoiceChannel] Voice channel category not found for auto-positioning');
            return;
        }

        // Find the waiting room channel
        let waitingRoomChannel = null;
        
        // First try to get from config
        if (voiceConfig.positioning.waitingRoomChannelId) {
            waitingRoomChannel = guild.channels.cache.get(voiceConfig.positioning.waitingRoomChannelId);
        }
        
        // If not found, try to find by name
        if (!waitingRoomChannel) {
            waitingRoomChannel = category.children.cache.find(channel => 
                channel.type === 2 && // Voice channel
                (channel.name.toLowerCase().includes('waiting') || 
                 channel.name.toLowerCase().includes('wait'))
            );
        }

        if (!waitingRoomChannel) {
            console.log('[VoiceChannel] No waiting room channel found, skipping auto-positioning');
            return;
        }

        // Find all custom voice channels (excluding Join to Create and Waiting Room)
        const customChannels = category.children.cache.filter(ch => 
            ch.type === 2 && // Voice channel
            ch.id !== joinToCreateChannel.id && 
            ch.id !== waitingRoomChannel.id &&
            !ch.name.toLowerCase().includes('waiting') &&
            !ch.name.toLowerCase().includes('wait')
        );

        // Calculate the position: Join to Create at TOP, then custom channels, then waiting room
        let newPosition;
        
        if (customChannels.size === 0) {
            // No custom channels, position above waiting room (but not AT the waiting room position)
            // We need to position one slot above the waiting room to avoid displacing it
            newPosition = Math.max(0, waitingRoomChannel.position - 1);
        } else {
            // Find the first (topmost) custom channel and position above it
            const firstCustomChannel = customChannels.sort((a, b) => a.position - b.position).first();
            newPosition = Math.max(0, firstCustomChannel.position - 1);
        }

        // Only move if position needs to change and the new position is different
        if (joinToCreateChannel.position !== newPosition && newPosition >= 0) {
            await joinToCreateChannel.setPosition(newPosition);
            console.log(`[VoiceChannel] Auto-positioned "Join to Create" channel to position ${newPosition} (above custom channels, below waiting room)`);
        } else {
            console.log('[VoiceChannel] "Join to Create" channel already in correct position');
        }

    } catch (error) {
        console.error('[VoiceChannel] Error auto-positioning Join to Create channel:', error);
    }
}

/**
 * Initialize the voice channel service
 * @param {Object} client - Discord client instance
 */
async function initializeVoiceChannelService(client) {
    console.log('[VoiceChannel] Initializing voice channel service');
    
    // Check for missing configuration
    if (!voiceConfig.joinToCreate.channelId) {
        console.warn('[VoiceChannel] Join to Create channel ID not configured');
        return;
    }
    
    if (!voiceConfig.joinToCreate.categoryId) {
        console.warn('[VoiceChannel] Voice channel category ID not configured');
        return;
    }

    // Auto-position the Join to Create channel
    try {
        // Get the guild (assuming there's only one guild the bot is in)
        const guild = client.guilds.cache.first();
        if (guild) {
            await autoPositionJoinToCreateChannel(guild);
        }
    } catch (error) {
        console.error('[VoiceChannel] Error during auto-positioning:', error);
    }
}

module.exports = {
    handleJoinToCreate,
    handleChannelLeave,
    handleChannelJoin,
    inviteToVoiceChannel,
    isUserCreatedChannel,
    getChannelCreator,
    initializeVoiceChannelService,
    calculateChannelPosition,
    autoPositionJoinToCreateChannel
}; 
