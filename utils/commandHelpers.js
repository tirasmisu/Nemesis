const { EmbedBuilder, ChannelType, PermissionsBitField, PermissionFlagsBits } = require('discord.js');
const { generateUniquePunishmentId } = require('./generatePunishmentId');
// Legacy permissions import removed - now using roleConfig system
const { notifyUser, createSmartUserMention } = require('./utils');
const ModerationAction = require('../models/ModerationAction');
const ms = require('ms');
const roleConfig = require('../config/roles');
const channelConfig = require('../config/channels');

// Shared command configuration - Updated with all available commands
const COMMAND_CONFIG = {
    helpers: {
        commands: [
            { name: '/modview (user)', value: 'View a user\'s moderation history.' },
            { name: '/userinfo (user)', value: 'View information about a user.' },
            { name: '/avatar (user)', value: 'View a user\'s avatar.' },
            { name: '/reasonedit (PunishmentID) (New Reason)', value: 'Edit a punishment reason and notify the user.' },
            { name: '/warn (user) (reason)', value: 'Warn a user for a low level offence.' },
            { name: '/mute (user) (duration) (reason)', value: 'Mute a user for repeated warnings or mid-level offences.' },
            { name: '/unmute (user)', value: 'Remove an ongoing mute from a user.' },
            { name: '/sendblacklist', value: 'DM the current blacklist to yourself.' },
            { name: '/ping', value: 'Check bot latency.' },
            { name: '/staffguide', value: 'Display staff guidelines and rules.' },
            { name: '/closeticket', value: 'Close a ticket and archive its contents.' },
            { name: '/translate (text) (target)', value: 'Translate text to another language.' },
            { name: '/disconnect (user)', value: 'Disconnect a user from voice channel (when they block you).' },
            { name: '/helpstaff', value: 'Show all available staff commands.' },
            { name: '/changelog', value: 'View recent bot updates and changes.' },
            { name: '/ooo', value: 'Toggle Out of Office role on/off for staff members.' },
            { name: '/addrole (user) (role) (duration)', value: 'Add a role to a user with optional duration.' },
            { name: '/setnick (user) (nickname)', value: 'Set a user\'s nickname.' }
        ]
    },
    mods: {
        commands: [
            { name: '/ban (user) (reason)', value: 'Permanently ban a user from the server.' },
            { name: '/unban (user) (reason)', value: 'Remove a ban from a user.' },
            { name: '/kick (user) (reason)', value: 'Kick a user from the server.' },
            { name: '/purge (amount) [user]', value: 'Delete multiple messages at once.' },
            { name: '/purgeuser (user) (amount)', value: 'Delete messages from a specific user.' },
            { name: '/lock [channel] [reason]', value: 'Lock a channel to prevent new messages.' },
            { name: '/removerole (user) (role)', value: 'Remove a role from a user.' },
            { name: '/removepunishment (punishmentId)', value: 'Remove a punishment from a user\'s record.' },
            { name: '/updatecount', value: 'Update server member count display.' }
        ]
    },
    seniorMods: {
        commands: [
            { name: '/staffview (user)', value: 'View comprehensive staff moderation history.' },
            { name: '/blacklistword (word)', value: 'Add a word to the blacklist.' },
            { name: '/unblacklistword (word)', value: 'Remove a word from the blacklist.' },
            { name: '/whitelistword (word) [reason]', value: 'Add a word to the whitelist to bypass blacklist filtering.' },
            { name: '/unwhitelistword (word)', value: 'Remove a word from the whitelist.' },
            { name: '/sendwhitelist [page]', value: 'View the current whitelist with pagination.' }
        ]
    },
    admins: {
        commands: [
            { name: '/setupnickrequest', value: 'Set up the nickname request system.' },
            { name: '/createevent (type) (title)', value: 'Create temporary event channels for YouTube content.' },
            { name: '/debugperms (target)', value: 'Debug permission system for troubleshooting.' },
            { name: '/status [type]', value: 'View comprehensive bot system status and performance.' },
            { name: '/analytics [type]', value: 'View server engagement analytics and insights.' },
            { name: '/setlevel (user) (level)', value: 'Set a user\'s XP level.' },
            { name: '/resetlevel (user)', value: 'Reset a user\'s XP level to 0.' },
            { name: '/importxp (file)', value: 'Import XP data from external sources.' },

            { name: '/checkmute (user)', value: 'Check if a user has an active mute.' },
            { name: '/cleanupexpiredmutes', value: 'Clean up expired mutes from the database.' },
            { name: '/auditroles', value: 'Audit and display server roles information.' },
            { name: '/say (message)', value: 'Make the bot say something.' },
            { name: '/databaseremove (collection) (query)', value: 'Remove data from database collections.' }
        ]
    },
    public: {
        commands: [
            { name: '/help', value: 'Show general bot help and information.' },
            { name: '/ping', value: 'Check bot response time.' },
            { name: '/userinfo [user]', value: 'View information about yourself or another user.' },
            { name: '/avatar [user]', value: 'View avatar of yourself or another user.' },
            { name: '/rank [user]', value: 'View XP rank of yourself or another user.' },
            { name: '/level [user]', value: 'View XP level of yourself or another user.' },
            { name: '/leaderboard', value: 'View server XP leaderboard.' },
            { name: '/invite (user)', value: 'Invite someone to your voice channel.' },
            { name: '/nickname (nickname)', value: 'Request a nickname change.' },
            { name: '/translate (text) [language]', value: 'Translate text to another language.' }
        ]
    }
};

// Rate limiting configuration
const RATE_LIMITS = {
    warn: { max: 5, window: 60000 }, // 5 warns per minute
    mute: { max: 3, window: 300000 }, // 3 mutes per 5 minutes
    ban: { max: 2, window: 300000 }, // 2 bans per 5 minutes
    kick: { max: 3, window: 300000 }, // 3 kicks per 5 minutes
    purge: { max: 10, window: 60000 }, // 10 purges per minute
};

// Command cooldowns
const COOLDOWNS = new Map();

// Common embed creation for moderation actions
async function createModerationEmbed(punishmentId, actionType, details, client, guild) {
    const colors = {
        ban: 0xFF0000,
        unban: 0x00FF00,
        mute: 0xFFA500,
        unmute: 0x00FF00,
        kick: 0xFF0000,
        warn: 0xFFFF00,
        purge: 0x00FFFF,
        lock: 0xFFA500,
        unlock: 0x00FF00,
        role: 0x00FFFF
    };

    // Create smart user mentions
    const userMention = await createSmartUserMention(details.user.id, client, guild, { showMemberStatus: true });
    const moderatorMention = await createSmartUserMention(details.moderator.id, client, guild, { showRawId: true });

    const embed = new EmbedBuilder()
        .setColor(colors[actionType] || 0x000000)
        .setDescription("### **Moderation Log**")
        .setFooter({ text: `Punishment ID: ${punishmentId}` })
        .setThumbnail(details.user.displayAvatarURL({ dynamic: true }))
        .addFields([
            { 
                name: getActionEmoji(actionType) + " " + capitalizeFirst(actionType), 
                value: `**User:** ${userMention} (${details.user.tag})`, 
                inline: false 
            },
            { name: "Reason", value: details.reason, inline: false },
            { name: "Duration", value: details.duration || "N/A", inline: true },
            { name: "Moderator", value: moderatorMention, inline: true }
        ]);

    return embed;
}

// Helper function to get emoji for action type
function getActionEmoji(actionType) {
    const emojis = {
        ban: "🔨",
        unban: "🔓",
        mute: "🔇",
        unmute: "🔊",
        kick: "👢",
        warn: "⚠️",
        purge: "🧹",
        lock: "🔒",
        unlock: "🔓",
        role: "👑"
    };
    return emojis[actionType] || "📝";
}

// Helper function to capitalize first letter
function capitalizeFirst(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// Enhanced error handling with detailed logging
async function handleError(interaction, error, context) {
    console.error(`Error in ${context}:`, error);
    
    const logChannel = getModerationLogChannel(interaction.guild);
    
    const userMention = await createSmartUserMention(interaction.user.id, interaction.client, interaction.guild, { showRawId: true });
    const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setDescription(`### **Error Log**`)
        .addFields(
            { name: "Context", value: context, inline: true },
            { name: "Error Type", value: error.name || "Unknown", inline: true },
            { name: "Error Message", value: error.message || "No message provided", inline: false },
            { name: "Stack Trace", value: error.stack ? `\`\`\`${error.stack.slice(0, 1000)}...\`\`\`` : "No stack trace", inline: false },
            { name: "User", value: userMention, inline: true },
            { name: "Channel", value: `<#${interaction.channelId}>`, inline: true },
            { name: "Guild", value: interaction.guild.name, inline: true }
        )
        .setTimestamp();

    if (logChannel) {
        try {
            await logChannel.send({ embeds: [errorEmbed] });
        } catch (logError) {
            console.error('Failed to send error to log channel:', logError);
        }
    }

    const userMessage = {
        content: `An error occurred while ${context.toLowerCase()}. The error has been logged.`,
        flags: ['Ephemeral']
    };

    if (interaction.replied || interaction.deferred) {
        await interaction.followUp(userMessage);
    } else {
        await interaction.reply(userMessage);
    }
}

// Rate limiting check
function checkRateLimit(userId, command) {
    const now = Date.now();
    const rateLimit = RATE_LIMITS[command];
    
    if (!rateLimit) return true;
    
    const userCooldowns = COOLDOWNS.get(userId) || new Map();
    const commandCooldown = userCooldowns.get(command) || [];
    
    // Remove expired cooldowns
    const validCooldowns = commandCooldown.filter(timestamp => now - timestamp < rateLimit.window);
    
    if (validCooldowns.length >= rateLimit.max) {
        return false;
    }
    
    validCooldowns.push(now);
    userCooldowns.set(command, validCooldowns);
    COOLDOWNS.set(userId, userCooldowns);
    
    return true;
}

/**
 * Enhanced permission check using role IDs for security and efficiency
 * @param {Interaction|GuildMember} interactionOrMember - Discord interaction or guild member
 * @param {string} requiredRoleKey - Required role key from role config
 * @returns {Promise<boolean>} Whether the user has permission
 */
async function checkModerationPermission(interactionOrMember, requiredRoleKey) {
    try {
        // Determine if we have an interaction or just a member
        const isInteraction = interactionOrMember && 
                             interactionOrMember.guild && 
                             interactionOrMember.user && 
                             typeof interactionOrMember.reply === 'function';
                             
        // Get the member and guild regardless of what was passed
        const member = isInteraction ? interactionOrMember.member : interactionOrMember;
        const guild = isInteraction ? interactionOrMember.guild : (member.guild || null);
        
        // Safety checks
        if (!member) {
            console.error('[PERMISSION] Member object is undefined or null');
            return false;
        }
        
        if (!member.roles || !member.roles.cache) {
            console.error('[PERMISSION] Member roles cache is undefined');
            return false;
        }

        // Check for Out of Office role - if they have it and they're staff, block command usage
        if (roleConfig.memberHasRole(member, 'OUT_OF_OFFICE') && 
            roleConfig.memberHasRole(member, 'STAFF')) {
            
            console.log(`[PERMISSION] ⛔ User ${member.user?.tag || 'unknown'} blocked due to Out of Office status`);
            
            if (isInteraction) {
                try {
                    const oooMessage = "You cannot use staff commands while having the Out of Office role. Please remove the role before performing moderation actions.";
                    
                    if (interactionOrMember.deferred || interactionOrMember.replied) {
                        await interactionOrMember.editReply({ content: oooMessage });
                    } else {
                        await interactionOrMember.reply({ content: oooMessage, flags: ['Ephemeral'] });
                    }
                } catch (replyError) {
                    console.error('[PERMISSION] Failed to send OOO status message:', replyError);
                    
                    try {
                        if (interactionOrMember.followUp) {
                            await interactionOrMember.followUp({
                                content: "You cannot use staff commands while having the Out of Office role.",
                                flags: ['Ephemeral']
                            });
                        }
                    } catch (followUpError) {
                        console.error('[PERMISSION] Failed to send followUp OOO message:', followUpError);
                    }
                }
            }
            
            return false;
        }

        // Convert legacy role key to standard role key
        const standardRoleKey = mapLegacyRoleKey(requiredRoleKey);
        
        // Debug logging
        console.log(`[PERMISSION] User ${member.user?.tag || 'unknown'} requesting permission for ${standardRoleKey}`);
        
        // Check for guild owner - always has access
        if (member.id === guild?.ownerId) {
            console.log(`[PERMISSION] ✅ User granted permission as server owner`);
            return true;
        }

        // Check for Administrator permission - always has access
        if (member.permissions.has(PermissionFlagsBits.Administrator)) {
            console.log(`[PERMISSION] ✅ User granted permission via Administrator permission`);
            return true;
        }
        
        // Check if user meets hierarchy requirement using role config
        if (roleConfig.memberMeetsHierarchyRequirement(member, standardRoleKey)) {
            console.log(`[PERMISSION] ✅ User granted permission via hierarchy requirement`);
            return true;
        }
        
        console.log(`[PERMISSION] ❌ User denied permission for ${standardRoleKey}`);
        return false;
    } catch (error) {
        console.error('[PERMISSION] Error in checkModerationPermission:', error);
        return false;
    }
}

/**
 * Map legacy role keys to standard role keys
 * @param {string} legacyKey - Legacy role key
 * @returns {string} Standard role key
 */
function mapLegacyRoleKey(legacyKey) {
    const mapping = {
        'helpers': 'HELPERS',
        'mods': 'MODERATORS', 
        'moderators': 'MODERATORS',
        'srmods': 'SENIOR_MODERATORS',
        'seniorMods': 'SENIOR_MODERATORS',
        'senior mods': 'SENIOR_MODERATORS',
        'Senior Moderators': 'SENIOR_MODERATORS',
        'senior moderators': 'SENIOR_MODERATORS',
        'admins': 'ADMINS',
        'admin': 'ADMINS'
    };
    
    return mapping[legacyKey] || legacyKey.toUpperCase();
}

/**
 * Check target hierarchy using role IDs for security
 * @param {Interaction} interaction - Discord interaction
 * @param {GuildMember} targetMember - Target member to check
 * @returns {Promise<boolean>} Whether the action is allowed
 */
async function checkTargetHierarchy(interaction, targetMember) {
    try {
        const executor = interaction.member;
        
        if (!executor || !targetMember) {
            console.error('[HIERARCHY] Missing executor or target member');
            return false;
        }

        // Cannot target guild owner
        if (targetMember.id === interaction.guild.ownerId) {
            console.log('[HIERARCHY] ❌ Cannot target server owner');
            return false;
        }

        // Cannot target self (usually)
        if (executor.id === targetMember.id) {
            console.log('[HIERARCHY] ❌ Cannot target self');
            return false;
        }

        // Get hierarchy levels using role config
        const executorLevel = roleConfig.getMemberHierarchyLevel(executor);
        const targetLevel = roleConfig.getMemberHierarchyLevel(targetMember);

        // Executor must have higher hierarchy level than target
        const hasPermission = executorLevel > targetLevel;
        
        console.log(`[HIERARCHY] Executor level: ${executorLevel}, Target level: ${targetLevel}, Permission: ${hasPermission ? '✅' : '❌'}`);
        
        return hasPermission;
    } catch (error) {
        console.error('[HIERARCHY] Error in checkTargetHierarchy:', error);
        return false;
    }
}

// Enhanced moderation action saver with validation
async function saveModerationAction(actionDetails) {
    try {
        // Validate required fields
        const requiredFields = ['userId', 'moderatorId', 'action', 'reason'];
        for (const field of requiredFields) {
            if (!actionDetails[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        const punishmentId = await generateUniquePunishmentId();
        const action = new ModerationAction({
            userId: actionDetails.userId,
            moderatorId: actionDetails.moderatorId,
            action: actionDetails.action,
            reason: actionDetails.reason,
            duration: actionDetails.duration,
            actionId: punishmentId,
            timestamp: new Date(),
            active: true,
            metadata: actionDetails.metadata || {}
        });

        await action.save();
        return punishmentId;
    } catch (error) {
        console.error('Error saving moderation action:', error);
        throw error;
    }
}

// Enhanced user notification with retry mechanism
async function notifyUserOfAction(user, guild, action, duration, reason) {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
        try {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setDescription(`### **Moderation Action**`)
                .addFields(
                    { name: "Action", value: action.charAt(0).toUpperCase() + action.slice(1), inline: true },
                    { name: "Server", value: guild.name, inline: true },
                    { name: "Reason", value: reason || "No reason provided", inline: false }
                );

            if (duration) {
                embed.addFields({ name: "Duration", value: ms(duration, { long: true }), inline: true });
            }

            await user.send({ embeds: [embed] });
            return true;
        } catch (error) {
            retryCount++;
            if (retryCount === maxRetries) {
                console.error(`Failed to notify user after ${maxRetries} attempts:`, error);
                return false;
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
    }
}

// Common duration validation
function validateDuration(durationInput) {
    if (durationInput.toLowerCase() === "forever") {
        return { valid: true, duration: null };
    }
    
    const durationMs = ms(durationInput);
    if (!durationMs) {
        return { 
            valid: false, 
            error: "Invalid duration format. Use '1h', '30m', or 'forever'." 
        };
    }
    
    return { valid: true, duration: durationMs };
}

// Enhanced moderation log channel finder with error handling
function getModerationLogChannel(guild) {
    try {
        const channel = guild.channels.cache.find(channel =>
            channel.name.toLowerCase() === '📝」moderation-log' &&
            channel.type === ChannelType.GuildText
        );
        
        if (!channel) {
            console.error('Moderation log channel not found in guild:', guild.name);
        }
        
        return channel;
    } catch (error) {
        console.error('Error finding moderation log channel:', error);
        return null;
    }
}

// Common channel permission check
function checkChannelPermissions(channel, permissions) {
    const botMember = channel.guild.members.me;
    const missingPermissions = [];
    
    for (const permission of permissions) {
        if (!botMember.permissionsIn(channel).has(permission)) {
            missingPermissions.push(permission);
        }
    }
    
    return {
        hasPermissions: missingPermissions.length === 0,
        missingPermissions
    };
}

// Common role management
async function manageRole(member, role, action) {
    try {
        if (action === 'add') {
            await member.roles.add(role);
        } else if (action === 'remove') {
            await member.roles.remove(role);
        }
        return true;
    } catch (error) {
        console.error(`Error ${action}ing role:`, error);
        return false;
    }
}

// Common message purge
async function purgeMessages(channel, amount, filter) {
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const filteredMessages = messages.filter(filter);
        const messagesToDelete = filteredMessages.first(amount);
        
        if (messagesToDelete.length === 0) {
            return { success: false, error: "No messages found matching the criteria." };
        }
        
        await channel.bulkDelete(messagesToDelete);
        return { success: true, count: messagesToDelete.length };
    } catch (error) {
        console.error('Error purging messages:', error);
        return { success: false, error: error.message };
    }
}

// Common channel lock/unlock
async function toggleChannelLock(channel, lock) {
    try {
        const permissions = channel.permissionOverwrites.cache;
        const everyoneRole = channel.guild.roles.everyone;
        
        if (lock) {
            await channel.permissionOverwrites.edit(everyoneRole, {
                SendMessages: false
            });
        } else {
            await channel.permissionOverwrites.delete(everyoneRole);
        }
        
        return true;
    } catch (error) {
        console.error('Error toggling channel lock:', error);
        return false;
    }
}

// Check for active punishments
async function checkActivePunishment(userId, actionType) {
    try {
        const activePunishment = await ModerationAction.findOne({
            userId: userId,
            action: actionType,
            active: true
        });
        return activePunishment;
    } catch (error) {
        console.error('Error checking active punishment:', error);
        return null;
    }
}

// Add on-call role management
async function updateOnCallRole(member) {
    const staffRole = member.guild.roles.cache.find(role => role.name === 'Staff');
    const onCallRole = member.guild.roles.cache.find(role => role.name === 'On-Call');
    
    if (!staffRole || !onCallRole) return;
    
    if (member.roles.cache.has(staffRole.id)) {
        if (member.presence?.status === 'online' || member.presence?.status === 'idle') {
            await member.roles.add(onCallRole).catch(console.error);
        } else {
            await member.roles.remove(onCallRole).catch(console.error);
        }
    }
}

// Add meme forwarding
async function forwardMeme(message) {
    // Use channel config instead of hardcoded IDs
    const channelConfig = require('../config/channels');
    const MEME_SOURCE_ID = channelConfig.getId('MEME_SOURCE');
    const MEME_FORWARD_ID = channelConfig.getId('MEME_FORWARD');
    
    // Only process messages from the source channel
    if (message.channel.id !== MEME_SOURCE_ID) return;
    
    // Get the target channel
    const targetChannel = message.guild.channels.cache.get(MEME_FORWARD_ID);
    if (!targetChannel) {
        console.error(`[MemeForward] Could not find target channel with ID ${MEME_FORWARD_ID}`);
        return;
    }
    
    try {
        let sentMessages = [];
        const userMention = await createSmartUserMention(message.author.id, message.client, message.guild, { showRawId: true });
        
        // Create the message link
        const messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
        
        // First send the basic message with user info and content (only if there's content)
        if (message.content) {
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setAuthor({
                    name: message.author.tag,
                    iconURL: message.author.displayAvatarURL({ dynamic: true }),
                    url: `https://discord.com/users/${message.author.id}`
                })
                .setDescription(message.content)
                .setFooter({ text: `User ID: ${message.author.id}` })
                .setTimestamp();
                
            const sentMsg = await targetChannel.send({
                content: `${userMention} shared: [Original Message](${messageLink})`,
                embeds: [embed]
            });
            
            sentMessages.push(sentMsg);
        }
        
        // Then process each attachment individually - prioritizing media content
        if (message.attachments.size > 0) {
            for (const [id, attachment] of message.attachments) {
                try {
                    // For images, create a separate embed with the image
                    if (attachment.contentType?.startsWith('image/')) {
                        const imageEmbed = new EmbedBuilder()
                            .setColor(0x0099FF)
                            .setAuthor({
                                name: message.author.tag,
                                iconURL: message.author.displayAvatarURL({ dynamic: true }),
                                url: `https://discord.com/users/${message.author.id}`
                            })
                            .setFooter({ text: `User ID: ${message.author.id}` });
                        
                        // Try to set the image, add skull emoji if invalid
                        try {
                            imageEmbed.setImage(attachment.url);
                            const sentMsg = await targetChannel.send({ 
                                content: message.content ? null : `${userMention} shared: [Original Message](${messageLink})`,
                                embeds: [imageEmbed] 
                            });
                            sentMessages.push(sentMsg);
                        } catch (imgError) {
                            // Image likely deleted/invalid, add skull emoji
                            const sentMsg = await targetChannel.send({ 
                                content: `${userMention} shared: [Original Message](${messageLink}) 💀`,
                                embeds: [imageEmbed] 
                            });
                            sentMessages.push(sentMsg);
                        }
                    } 
                    // For videos and other files, try to handle them in a nice way
                    else if (attachment.contentType?.startsWith('video/')) {
                        // Videos work best as direct attachments
                        const videoEmbed = new EmbedBuilder()
                            .setColor(0x0099FF)
                            .setAuthor({
                                name: message.author.tag,
                                iconURL: message.author.displayAvatarURL({ dynamic: true }),
                                url: `https://discord.com/users/${message.author.id}`
                            })
                            .setFooter({ text: `User ID: ${message.author.id}` });
                        
                        try {
                            const sentMsg = await targetChannel.send({
                                content: `${userMention} shared: [Original Message](${messageLink})`,
                                embeds: [videoEmbed],
                                files: [{
                                    attachment: attachment.url,
                                    name: attachment.name || 'video.mp4'
                                }]
                            });
                            sentMessages.push(sentMsg);
                        } catch (videoError) {
                            // Video likely deleted/invalid, add skull emoji
                            const sentMsg = await targetChannel.send({
                                content: `${userMention} shared: [Original Message](${messageLink}) 💀`,
                                embeds: [videoEmbed]
                            });
                            sentMessages.push(sentMsg);
                        }
                    }
                    // Other files
                    else {
                        try {
                            const sentMsg = await targetChannel.send({
                                content: `${userMention} shared: [Original Message](${messageLink})`,
                                files: [{
                                    attachment: attachment.url,
                                    name: attachment.name || 'file'
                                }]
                            });
                            sentMessages.push(sentMsg);
                        } catch (fileError) {
                            // File likely deleted/invalid, add skull emoji
                            const sentMsg = await targetChannel.send({
                                content: `${userMention} shared: [Original Message](${messageLink}) 💀`
                            });
                            sentMessages.push(sentMsg);
                        }
                    }
                    
                    // Add small delay between sending attachments to avoid rate limits
                    await new Promise(resolve => setTimeout(resolve, 300));
                } catch (attachErr) {
                    console.error('Error forwarding individual attachment:', attachErr);
                }
            }
        }
        
        // Forward any embeds from the original message (like from links)
        if (message.embeds && message.embeds.length > 0) {
            try {
                for (const originalEmbed of message.embeds) {
                    // Skip empty embeds
                    if (!originalEmbed.url && !originalEmbed.image && !originalEmbed.title && !originalEmbed.description) {
                        continue;
                    }
                    
                    // Create a new embed with the same properties
                    const forwardedEmbed = new EmbedBuilder()
                        .setColor(originalEmbed.color || 0x0099FF)
                        .setAuthor({
                            name: message.author.tag,
                            iconURL: message.author.displayAvatarURL({ dynamic: true }),
                            url: `https://discord.com/users/${message.author.id}`
                        })
                        .setFooter({ text: `User ID: ${message.author.id}` });
                    
                    // Copy over relevant properties if they exist
                    if (originalEmbed.title) forwardedEmbed.setTitle(originalEmbed.title);
                    if (originalEmbed.description) forwardedEmbed.setDescription(originalEmbed.description);
                    if (originalEmbed.url) forwardedEmbed.setURL(originalEmbed.url);
                    
                    // Try to set image - if it fails, add skull emoji
                    let imageValid = true;
                    if (originalEmbed.image) {
                        try {
                            forwardedEmbed.setImage(originalEmbed.image.url);
                        } catch (imageError) {
                            imageValid = false;
                        }
                    }
                    if (originalEmbed.thumbnail) {
                        try {
                            forwardedEmbed.setThumbnail(originalEmbed.thumbnail.url);
                        } catch (thumbnailError) {
                            // Continue even if thumbnail fails
                        }
                    }
                    if (originalEmbed.footer) {
                        // Combine original footer with our user ID footer
                        forwardedEmbed.setFooter({ 
                            text: `${originalEmbed.footer.text} • User ID: ${message.author.id}`, 
                            iconURL: originalEmbed.footer.iconURL 
                        });
                    }
                    
                    const sentMsg = await targetChannel.send({ 
                        content: `${userMention} shared: [Original Message](${messageLink})${!imageValid ? ' 💀' : ''}`,
                        embeds: [forwardedEmbed] 
                    });
                    
                    sentMessages.push(sentMsg);
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            } catch (embedError) {
                console.error('Error forwarding embed in meme channel:', embedError);
            }
        }
        
        // Add reactions to all sent messages for voting
        for (const sentMsg of sentMessages) {
            try {
                await sentMsg.react('✅'); // Green checkmark
                await sentMsg.react('❌'); // Red X
            } catch (reactionError) {
                console.error('Error adding reactions to forwarded message:', reactionError);
            }
        }
    } catch (error) {
        console.error('Error forwarding meme:', error);
    }
}

// Add no GIFs role check
async function checkGifPermission(member) {
    // Use direct role ID for No GIFs role
    const NO_GIFS_ROLE_ID = '1370134955832770580';
    const LEVEL_25_ROLE_ID = '1066909500210151555'; // Direct role ID for Level 25
    
    // Check for No GIFs role first - this overrides any other permissions
    if (member.roles.cache.has(NO_GIFS_ROLE_ID)) {
        console.log(`[GIF Permission Helper] ${member.user.tag} has No GIFs role (ID: ${NO_GIFS_ROLE_ID}), blocking GIF`);
        return false;
    }
    
    // Use direct role ID check instead of name search
    return member.roles.cache.has(LEVEL_25_ROLE_ID);
}

/**
 * Displays a user's modview as a followup to an interaction
 * @param {Object} interaction - The interaction object
 * @param {Object} user - The user to display modview for
 * @param {boolean} ephemeral - Whether the modview should be ephemeral
 * @param {boolean} skipPermissionCheck - Whether to skip permission checks (for internal use)
 * @returns {Promise<boolean>} Whether the modview was displayed successfully
 */
async function showModview(interaction, user, ephemeral = true, skipPermissionCheck = false) {
    try {
        // Defensive: fetch user if only an ID is provided
        if (typeof user === 'string') {
            user = await interaction.client.users.fetch(user);
        }
        
        // Check if the modview command exists
        const modviewCommand = interaction.client.commands.get('modview');
        if (!modviewCommand || !modviewCommand.executeCommand) {
            return false;
        }
        
        // Create a modified interaction context that skips permission validation
        // but preserves all necessary methods and properties
        const modviewContext = { 
            ...interaction,
            user: interaction.user,
            guild: interaction.guild,
            client: interaction.client,
            commandName: 'modview',
            options: {
                getUser: () => user,
                getString: () => null,
                getInteger: () => null,
                getBoolean: () => null
            },
            // For internal use, pass skipPermissionCheck flag to modview command
            _skipPermissionCheck: skipPermissionCheck || true
        };
        
        // For better compatibility when called from other commands
        if (!modviewContext.replied && !modviewContext.deferred) {
            modviewContext.replied = interaction.replied || interaction.deferred;
            modviewContext.deferred = interaction.deferred;
        }
        
        try {
            // Execute modview command directly with our context to bypass validation issues
            const modviewResult = await modviewCommand.executeCommand(modviewContext);
            
            // Send the modview as a followup if successful
            if (modviewResult && modviewResult.embed) {
                await interaction.followUp({ 
                    embeds: [modviewResult.embed],
                    ephemeral
                });
                return true;
            }
        } catch (cmdError) {
            console.error('Error executing modview command:', cmdError);
            // Silently fail - this is an auxiliary function so it shouldn't break the parent command
            return false;
        }
        
        return false;
    } catch (error) {
        console.error('Error showing modview:', error);
        return false;
    }
}

// Generic permission checker function for backward compatibility
async function checkPermissions(interaction, requiredRoles) {
    // Map generic role names to specific role keys
    const roleMapping = {
        'admin': 'ADMINS',
        'seniormod': 'SENIOR_MODERATORS', 
        'mod': 'MODERATORS',
        'helper': 'HELPERS'
    };

    if (!Array.isArray(requiredRoles)) {
        requiredRoles = [requiredRoles];
    }

    // Check if user has any of the required roles
    for (const roleKey of requiredRoles) {
        const mappedRole = roleMapping[roleKey.toLowerCase()] || roleKey.toUpperCase();
        
        try {
            if (await checkModerationPermission(interaction, mappedRole)) {
                return true;
            }
        } catch (error) {
            console.error(`[PERMISSION] Error checking role ${mappedRole}:`, error);
            continue;
        }
    }

    // If no permissions found, send error message
    if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
            content: 'You do not have permission to use this command.',
            flags: ['Ephemeral']
        });
    }

    return false;
}

module.exports = {
    createModerationEmbed,
    checkModerationPermission,
    checkTargetHierarchy,
    validateDuration,
    getModerationLogChannel,
    saveModerationAction,
    notifyUserOfAction,
    checkChannelPermissions,
    manageRole,
    purgeMessages,
    toggleChannelLock,
    checkActivePunishment,
    updateOnCallRole,
    forwardMeme,
    checkGifPermission,
    COMMAND_CONFIG,
    handleError,
    checkRateLimit,
    RATE_LIMITS,
    COOLDOWNS,
    showModview,
    checkPermissions
}; 
