require('dotenv').config();
const { Events, EmbedBuilder, ChannelType } = require('discord.js');
const { handleCommandError } = require('../utils/errorHandler');
const { checkCommandPermission, checkGifPermission } = require('../utils/permissionManager');
const messageFilters = require('../utils/messageFilters');
const channelConfig = require('../config/channels');
const roleConfig = require('../config/roles');
const logger = require('../utils/logger');
const { forwardMeme } = require('../utils/commandHelpers');
const { awardMessageXP, sendLevelUpNotification } = require('../services/xpService');
const { checkForCompromisedAccount } = require('../services/compromiseDetection');

// Constants
const TICKETS_CHANNEL_ID = channelConfig.getId('TICKETS');
const MEME_SOURCE_CHANNEL_ID = channelConfig.getId('MEME_SOURCE');
const MEME_FORWARD_CHANNEL_ID = channelConfig.getId('MEME_FORWARD');
const STAFF_ROLES = ['Admins', 'T', 'TraniumBot', 'Moderators', 'Senior Moderators', 'Helpers', 'Trial Helpers'];
const ALLOWED_MUSIC_LINKS = [
    'spotify.com',
    'music.apple.com',
    'youtube.com',
    'youtu.be',
    'soundcloud.com',
    'tidal.com'
];

// Persistent ticket system
const ticketPersistence = require('../utils/ticketPersistence');

// Legacy maps for backward compatibility (now reference the persistent system)
const userToThread = ticketPersistence.userToThread;
const threadToUser = ticketPersistence.threadToUser;
// Track pending ticket creations to prevent duplicates
const pendingTicketCreations = new Map();
// Track recently closed tickets (userId -> timestamp)
const recentlyClosedTickets = new Map();

// Helper function to handle warning messages
async function handleWarningMessage(channel, userId, message, type) {
    try {
    const warningMessage = await channel.send(`🚫 <@${userId}> ${message}`);
    if (warningMessage) {
        setTimeout(async () => {
            try {
                await warningMessage.delete();
            } catch (err) {
                    if (err.code !== 10008) { // Ignore "Unknown Message" error
                        await logger.error('MESSAGE_CREATE', 'Failed to delete warning message', err);
                    }
                }
            }, 4000);
        }
        return warningMessage;
    } catch (error) {
        await logger.error('MESSAGE_CREATE', 'Failed to send warning message', error);
        return null;
    }
}

// Staff exemption check
function isStaffExempt(member) {
    if (!member) return false;
    return member.roles.cache.some(role => STAFF_ROLES.includes(role.name));
}

// Handle ticket system
async function handleTicketSystem(message) {
    try {
        if (message.channel.type !== ChannelType.DM) return;

        const userId = message.author.id;
        const messageContent = message.content.trim().toLowerCase();
        
        // Check if user has No Tickets role in the main guild
        const guild = message.client.guilds.cache.get(process.env.GUILD_ID);
        if (guild) {
            try {
                const member = await guild.members.fetch(userId);
                if (member) {
                    // Check for No Tickets role safely
                    let noTicketsRoleId;
                    try {
                        noTicketsRoleId = roleConfig.getId('NO_TICKETS');
                    } catch (configError) {
                        console.error('[Ticket] Error accessing roleConfig for NO_TICKETS:', configError);
                        noTicketsRoleId = '1325674369770586144'; // Fallback to hardcoded ID
                    }
                    
                    if (noTicketsRoleId && member.roles.cache.has(noTicketsRoleId)) {
                        console.log(`[Ticket] User ${userId} has No Tickets role, ignoring ticket creation`);
                        return;
                    }
                }
            } catch (error) {
                // If user isn't in the guild, we can still proceed with ticket creation
                console.log(`[Ticket] Could not check for No Tickets role: ${error.message}`);
            }
        }

        // Check if there's already an existing thread
        let threadId = userToThread.get(userId);
        let thread;

        // If user has a thread mapped
        if (threadId) {
            try {
                thread = await message.client.channels.fetch(threadId);
            } catch (error) {
                await logger.error('TICKET_SYSTEM', 'Error fetching existing ticket thread', error);
                userToThread.delete(userId);
                threadToUser.delete(threadId);
                // Thread not found, so we'll create a new one
                thread = null;
            }
        }

        // If user doesn't have an existing thread and didn't use -ticket, send deterrent message
        if (!thread && !messageContent.startsWith('-ticket')) {
            const deterrentEmbed = new EmbedBuilder()
                .setColor(0x702963)
                .setTitle('🤖 TraniumBot Support')
                .setDescription('Hello! I am **TraniumBot** and I\'m here to help!')
                .addFields(
                    { 
                        name: '🎫 To Open a Ticket', 
                        value: 'You must use the command **`-ticket`** to open a support ticket.\n\nMessaging me directly without using `-ticket` will not create a ticket.', 
                        inline: false 
                    },
                    { 
                        name: '💬 Want to Chat?', 
                        value: 'Please go back to the **Tranium Discord server** and continue chatting there!\n\nI only respond to ticket requests through the `-ticket` command.', 
                        inline: false 
                    }
                )
                .setFooter({ text: 'Use -ticket to open a support ticket' })
                .setTimestamp();

            try {
                await message.author.send({ embeds: [deterrentEmbed] });
            } catch (dmError) {
                console.log(`[Ticket] Could not send deterrent message to user ${userId}: ${dmError.message}`);
            }
            return;
        }

        // Check if there's already a pending ticket creation to prevent duplicates
        if (!thread && pendingTicketCreations.has(userId)) {
            // If there's a pending creation less than 10 seconds old, wait for it
            const pendingCreation = pendingTicketCreations.get(userId);
            const now = Date.now();
            
            if (now - pendingCreation.timestamp < 10000) {
                console.log(`[Ticket] Waiting for pending ticket creation for user ${userId}`);
                
                // If it's been more than 5 seconds, the other creation might have failed
                // We'll let this one proceed after clearing the pending status
                if (now - pendingCreation.timestamp > 5000) {
                    pendingTicketCreations.delete(userId);
                } else {
                    // Queue this message to be processed after the thread is created
                    pendingCreation.pendingMessages.push(message);
                    return;
                }
            } else {
                // Pending creation is too old, clear it
                pendingTicketCreations.delete(userId);
            }
        }

        // Create a new thread if one doesn't exist
        if (!thread) {
            // Check if the user had a recently closed ticket (within 2 minutes)
            const recentlyClosed = recentlyClosedTickets.get(userId);
            if (recentlyClosed) {
                const now = Date.now();
                const timeSinceClosed = now - recentlyClosed;
                
                // If it's been less than 2 minutes, don't create a new ticket
                if (timeSinceClosed < 2 * 60 * 1000) {
                    console.log(`[Ticket] User ${userId} had a ticket closed ${timeSinceClosed/1000} seconds ago, not creating a new one`);
                    // Let them know their messages are still going to the same ticket for 2 minutes
                    await message.author.send(`Your ticket was recently closed. Messages sent within 2 minutes of closing will not create a new ticket. Please wait before opening a new ticket.`);
                    return;
                } else {
                    // Remove from the recently closed tickets
                    recentlyClosedTickets.delete(userId);
                }
            }

            // Send initial prompt to user before creating ticket
            try {
                const promptEmbed = new EmbedBuilder()
                    .setColor(0x3498DB)
                    .setTitle('🎫 Ticket Creation')
                    .setDescription('Thank you for reaching out! Before I create your ticket, please note:')
                    .addFields(
                        { name: '📋 What to Include', value: '• A clear description of your issue\n• Any relevant screenshots or evidence\n• Steps you\'ve already tried (if applicable)', inline: false },
                        { name: '⚠️ Important', value: '• Please do not reply to warning messages\n• Be patient - staff will respond as soon as possible\n• Keep all discussion in this conversation', inline: false },
                        { name: '🚀 Ready?', value: 'Your ticket is being created now and staff will be notified!', inline: false }
                    )
                    .setFooter({ text: 'This is an automated message' })
                    .setTimestamp();

                await message.author.send({ embeds: [promptEmbed] });
            } catch (promptError) {
                console.error('[Ticket] Failed to send initial prompt:', promptError);
                // Continue with ticket creation even if prompt fails
            }

            // Mark that we're creating a ticket for this user to prevent duplicates
            pendingTicketCreations.set(userId, {
                timestamp: Date.now(),
                pendingMessages: []
            });
            
            const guild = message.client.guilds.cache.get(process.env.GUILD_ID);
            if (!guild) {
                pendingTicketCreations.delete(userId);
                throw new Error('Guild not found');
            }

            const ticketsChannel = message.client.channels.cache.get(TICKETS_CHANNEL_ID);
            if (!ticketsChannel) {
                pendingTicketCreations.delete(userId);
                throw new Error('Tickets channel not found');
            }

            // Get the Ticket Access role ID from config
            let ticketAccessRoleId;
            try {
                ticketAccessRoleId = roleConfig.getId('TICKET_ACCESS');
                if (!ticketAccessRoleId) {
                    console.warn('[Ticket] TICKET_ACCESS role ID not found in config');
                    ticketAccessRoleId = '1277791038756487179'; // Fallback to hardcoded ID
                }
            } catch (error) {
                console.error('[Ticket] Error accessing roleConfig:', error);
                ticketAccessRoleId = '1277791038756487179'; // Fallback to hardcoded ID
            }
            
            // Create a unique thread name with timestamp
            const date = new Date();
            const dateTag = `${date.toISOString().split('T')[0].replace(/-/g, '')}`;
            const threadName = `ticket-${message.author.username}-${dateTag}`;
            
            try {
                // Create a base message and ping the role
                let baseMsg;
                try {
                    baseMsg = await ticketsChannel.send(
                        `<@&${ticketAccessRoleId}> New conversation initiated for <@${userId}>.`
                    );
                } catch (msgError) {
                    console.log(`[TICKET_SYSTEM] ❌ Could not send message to tickets channel: ${msgError.message}`);
                    await message.author.send("❌ Sorry, there's an issue with the ticket system. Please contact staff directly.");
                    return;
                }

                // Create the private thread
                try {
                    thread = await baseMsg.startThread({
                        name: threadName,
                        autoArchiveDuration: 1440,
                        type: ChannelType.PrivateThread
                    });
                } catch (threadError) {
                    console.log(`[TICKET_SYSTEM] ❌ Could not create private thread: ${threadError.message}`);
                    await message.author.send("❌ Sorry, there's an issue creating your ticket thread. Please contact staff directly.");
                    
                    // Try to delete the base message if thread creation failed
                    try {
                        await baseMsg.delete();
                    } catch (deleteError) {
                        console.log(`[TICKET_SYSTEM] Could not clean up base message: ${deleteError.message}`);
                    }
                    return;
                }

                // Note: User is not added to the thread as they communicate through DMs with the bot

                // Use persistent ticket system
                ticketPersistence.setTicket(userId, thread.id);
                
                // Send a welcome message in the thread that's clearly from the bot
                try {
                    await thread.send(`Thank you <@${userId}> for reaching out. Our staff has been notified and will respond shortly.`);
                } catch (welcomeError) {
                    console.log(`[TICKET_SYSTEM] ⚠️ Could not send welcome message to thread: ${welcomeError.message}`);
                }
                
                // Send a confirmation to the user in DMs
                try {
                    await message.author.send(`Your ticket has been created and our staff has been notified. You'll receive responses here when our team replies.`);
                } catch (dmError) {
                    console.log(`[TICKET_SYSTEM] ⚠️ Could not send confirmation DM to user: ${dmError.message}`);
                    // Try to notify them in the thread instead
                    try {
                        await thread.send(`<@${userId}> Your ticket has been created! (Could not send DM confirmation)`);
                    } catch (threadNotifyError) {
                        console.log(`[TICKET_SYSTEM] Could not send thread notification either: ${threadNotifyError.message}`);
                    }
                }
                
                // Process any pending messages that came in during thread creation
                const pendingData = pendingTicketCreations.get(userId);
                if (pendingData && pendingData.pendingMessages.length > 0) {
                    for (const pendingMsg of pendingData.pendingMessages) {
                        // Forward each pending message to the new thread
                        await thread.send(`<@${userId}>: ${pendingMsg.content}`);
                        
                        // Handle attachments for pending messages
                        if (pendingMsg.attachments.size > 0) {
                            for (const [id, attachment] of pendingMsg.attachments) {
                                // Process attachments as we would normally
                                if (attachment.contentType?.startsWith('image/')) {
                                    await thread.send({
                                        content: `<@${userId}> sent an image:`,
                                        files: [attachment.url]
                                    });
                                } else {
                                    await thread.send({
                                        content: `<@${userId}> sent a file: ${attachment.name}`,
                                        files: [attachment.url]
                                    });
                                }
                            }
                        }
                    }
                }
                
            } catch (error) {
                console.log(`[TICKET_SYSTEM] ❌ Critical error creating ticket thread: ${error.message}`);
                
                // Provide helpful diagnostic information
                if (error.code === 50001) {
                    console.log(`[TICKET_SYSTEM] 🔧 PERMISSION ISSUE: Bot needs these permissions in tickets channel:`);
                    console.log(`   - Create Private Threads`);
                    console.log(`   - Manage Threads`);
                    console.log(`   - Use Private Threads`);
                    console.log(`   - Send Messages in Threads`);
                }
                
                // Try to notify the user about the issue
                try {
                    await message.author.send("❌ Sorry, there's a critical issue with the ticket system. Please contact staff directly or try again later.");
                } catch (dmError) {
                    console.log(`[TICKET_SYSTEM] Could not notify user of critical error: ${dmError.message}`);
                }
                
                await logger.error('TICKET_SYSTEM', 'Error creating ticket thread', error);
                pendingTicketCreations.delete(userId);
                // Don't re-throw the error, just log it and continue
            } finally {
                // Clear the pending creation now that we're done
                pendingTicketCreations.delete(userId);
            }
        }

        // Forward the current message content to the thread (if it's not already handled as a pending message)
        if (!pendingTicketCreations.has(userId) || !pendingTicketCreations.get(userId).pendingMessages.includes(message)) {
            // Handle message content
            if (message.reference) {
                // This is a reply to a previous message
                try {
                    // Get the original DM message that user replied to
                    const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
                    
                    // Try to find the corresponding thread message by content search
                    // This is an approximation as there's no direct mapping between DM and thread messages
                    const threadMessages = await thread.messages.fetch({ limit: 50 });
                    const botSentMessages = threadMessages.filter(m => 
                        m.author.id === message.client.user.id && 
                        m.content.includes(repliedMsg.content.substring(0, Math.min(repliedMsg.content.length, 30)))
                    );
                    
                    // If we found a potential match for the replied message in the thread
                    if (botSentMessages.size > 0) {
                        const closestMessage = botSentMessages.first();
                        await thread.send({
                            content: `<@${userId}> replied to: "${repliedMsg.content.substring(0, 50)}${repliedMsg.content.length > 50 ? '...' : ''}"\n\n${message.content}`,
                            allowedMentions: { users: [userId] }
                        });
                    } else {
                        // Fall back to regular message if we can't find the original
                        await thread.send(`<@${userId}>: ${message.content}`);
                    }
                } catch (error) {
                    await logger.error('TICKET_SYSTEM', 'Error handling reply in ticket system', error);
                    // Fall back to regular message on error
                    await thread.send(`<@${userId}>: ${message.content}`);
                }
            } else if (message.messageReference) {
                // Handle forwarded messages
                try {
                    const originalMessage = await message.channel.messages.fetch(message.messageReference.messageId);
                    
                    // Create a formatted forwarded message
                    const forwardedEmbed = new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle('📩 Forwarded Message')
                        .setDescription(originalMessage.content || 'No text content')
                        .setFooter({ text: `Originally sent by ${originalMessage.author.tag}` })
                        .setTimestamp(originalMessage.createdAt);

                    // If the original message has attachments, mention them
                    if (originalMessage.attachments.size > 0) {
                        const attachmentList = originalMessage.attachments.map(a => `📎 ${a.name}`).join('\n');
                        forwardedEmbed.addFields({ name: 'Attachments', value: attachmentList, inline: false });
                    }

                    await thread.send({
                        content: `<@${userId}> forwarded a message:`,
                        embeds: [forwardedEmbed],
                        allowedMentions: { users: [userId] }
                    });

                    // Also send the user's accompanying message if they added one
                    if (message.content && message.content.trim()) {
                        await thread.send(`<@${userId}>: ${message.content}`);
                    }

                    // Forward any attachments from the original message
                    if (originalMessage.attachments.size > 0) {
                        for (const [id, attachment] of originalMessage.attachments) {
                            try {
                                await thread.send({
                                    content: `<@${userId}> forwarded attachment: ${attachment.name}`,
                                    files: [{
                                        attachment: attachment.url,
                                        name: attachment.name
                                    }]
                                });
                            } catch (attachmentError) {
                                console.error(`[Ticket] Error forwarding attachment ${attachment.name}:`, attachmentError);
                                await thread.send(`<@${userId}> tried to forward attachment: ${attachment.name} but it could not be forwarded.`);
                            }
                        }
                    }
                } catch (error) {
                    await logger.error('TICKET_SYSTEM', 'Error handling forwarded message in ticket system', error);
                    // Fall back to regular message on error
                    if (message.content && message.content.trim()) {
                        await thread.send(`<@${userId}>: ${message.content}`);
                    }
                }
            } else {
                // Regular non-reply message
                if (message.content && message.content.trim()) {
                    await thread.send(`<@${userId}>: ${message.content}`);
                }
            }

            // Handle attachments (images, files) - properly forward them
            if (message.attachments.size > 0) {
                for (const [id, attachment] of message.attachments) {
                    try {
                        // For images, send them directly with proper forwarding
                        if (attachment.contentType?.startsWith('image/')) {
                            await thread.send({
                                content: `<@${userId}> sent an image:`,
                                files: [{
                                    attachment: attachment.url,
                                    name: attachment.name
                                }]
                            });
                        } else {
                            // For other files, properly forward them with original name
                            await thread.send({
                                content: `<@${userId}> sent a file: ${attachment.name}`,
                                files: [{
                                    attachment: attachment.url,
                                    name: attachment.name
                                }]
                            });
                        }
                    } catch (attachmentError) {
                        console.error(`[Ticket] Error forwarding attachment ${attachment.name}:`, attachmentError);
                        // Fallback: send a message about the file
                        await thread.send(`<@${userId}> tried to send a file: ${attachment.name} (${attachment.size} bytes) but it could not be forwarded.`);
                    }
                }
            }
        }
    } catch (error) {
        await logger.error('TICKET_SYSTEM', 'Error in ticket system', error);
    }
}

// Handle staff reply relay
async function handleStaffReply(message) {
    try {
        if (!message.channel.isThread()) return;
        if (message.author.id === message.client.user.id) return;

        const userId = threadToUser.get(message.channel.id);
        if (!userId) return;

        const trimmed = message.content.trim();
        if (trimmed.startsWith('-') || trimmed.startsWith('/') || trimmed.startsWith('.')) return;

        const user = await message.client.users.fetch(userId);
        
        // Check if the message is a reply to another message
        if (message.reference) {
            try {
                // Get the message being replied to
                const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
                
                // If it's a message from the user (relayed by the bot)
                if (repliedMsg.author.id === message.client.user.id && repliedMsg.content.startsWith(`<@${userId}>`)) {
                    // Extract the user's original content from the bot's relay message
                    const originalContent = repliedMsg.content.split(': ').slice(1).join(': ');
                    
                    // Send the reply with context to the user
                    const replyMessage = `**${message.author.username} replied to:** "${originalContent.substring(0, 50)}${originalContent.length > 50 ? '...' : ''}"\n\n${message.content}`;
                    if (replyMessage.trim()) {
                        await user.send(replyMessage);
                    }
                } else {
                    // Regular relay if not replying to the user's message
                    if (message.content && message.content.trim()) {
                        await user.send(message.content);
                    }
                }
            } catch (error) {
                await logger.error('STAFF_REPLY', 'Error handling staff reply reference', error);
                // Fall back to regular message on error - but check if content exists
                if (message.content && message.content.trim()) {
                    try {
                        await user.send(message.content);
                    } catch (fallbackError) {
                        await logger.error('STAFF_REPLY', 'Error in fallback message send', fallbackError);
                    }
                }
            }
        } else {
            // Send the text content (no reply reference) - but check if content exists
            if (message.content && message.content.trim()) {
                try {
                    await user.send(message.content);
                } catch (contentError) {
                    await logger.error('STAFF_REPLY', 'Error sending message content', contentError);
                }
            }
        }
        
        // Handle forwarded messages (from staff to user)
        if (message.messageReference) {
            try {
                const originalMessage = await message.channel.messages.fetch(message.messageReference.messageId);
                
                // Create a formatted forwarded message for the user
                const forwardInfo = `**${message.author.username} forwarded a message:**\n\n` +
                    `**Original from:** ${originalMessage.author.tag}\n` +
                    `**Content:** ${originalMessage.content || 'No text content'}\n` +
                    `**Sent:** ${originalMessage.createdAt.toLocaleString()}`;
                
                if (forwardInfo.trim()) {
                    await user.send(forwardInfo);
                }
                
                // Forward any attachments from the original message
                if (originalMessage.attachments.size > 0) {
                    for (const [id, attachment] of originalMessage.attachments) {
                        try {
                            await user.send({
                                content: `**Forwarded attachment:** ${attachment.name}`,
                                files: [{
                                    attachment: attachment.url,
                                    name: attachment.name
                                }]
                            });
                        } catch (attachmentError) {
                            console.error(`[StaffReply] Error forwarding attachment ${attachment.name}:`, attachmentError);
                            await user.send(`**Forwarded attachment:** ${attachment.name} (could not be forwarded)`);
                        }
                    }
                }
            } catch (error) {
                await logger.error('STAFF_REPLY', 'Error handling forwarded message in staff reply', error);
            }
        }

        // Send any attachments
        if (message.attachments.size > 0) {
            for (const [id, attachment] of message.attachments) {
                try {
                    await user.send({
                        files: [{
                            attachment: attachment.url,
                            name: attachment.name
                        }]
                    });
                } catch (attachmentError) {
                    await logger.error('STAFF_REPLY', 'Error sending attachment', attachmentError);
                }
            }
        }
    } catch (error) {
        await logger.error('STAFF_REPLY', 'Error in staff reply relay', error);
    }
}

// Handle message moderation
async function handleMessageModeration(message) {
    try {
        if (isStaffExempt(message.member)) return;

        // Check stickers
        if (message.stickers.size > 0) {
            const level10Role = message.guild.roles.cache.find(role => role.name === 'Level 10');
            const NITRO_BOOSTER_ROLE_ID = '591486031161720853';
            const hasLevel10 = level10Role && message.member.roles.cache.has(level10Role.id);
            const hasNitroBooster = message.member.roles.cache.has(NITRO_BOOSTER_ROLE_ID);
            
            if (!hasLevel10 && !hasNitroBooster) {
                await message.delete();
                await handleWarningMessage(message.channel, message.author.id, 'You need to be level 10 or higher, or have Discord Nitro to use stickers.', 'sticker');
                return;
            }
        }

        // Check GIFs
        const gifRegex = /tenor\.com\/view|giphy\.com\/gifs|gfycat\.com|\.gif/i;
        const tenorLinkCheck = message.content.includes('tenor.com/view');
        
        // First check: No GIFs role always takes precedence
        const NO_GIFS_ROLE_ID = '1370134955832770580';
        if (message.member.roles.cache.has(NO_GIFS_ROLE_ID)) {
            // If it contains any GIF content, delete it immediately
            if (message.content.includes('.gif') || 
                message.attachments.some(attachment => attachment.url.toLowerCase().endsWith('.gif')) ||
                gifRegex.test(message.content)) {
                
                // Debug: console.log(`[GIF Debug] User ${message.author.tag} has No GIFs role and tried to post GIF content`);
                await message.delete();
                await handleWarningMessage(message.channel, message.author.id, 'You don\'t have permission to send GIFs.', 'gif');
                return;
            }
        }
        
        // Otherwise, continue with normal processing
        // Determine if we should check for GIFs in this channel
        // Skip tenor link detection in general chat for Level 25+
        let shouldCheckGifs = true;
        const channelName = message.channel.name.toLowerCase();
        const LEVEL_25_ROLE_ID = '1066909500210151555';
        const hasLevel25 = message.member.roles.cache.has(LEVEL_25_ROLE_ID);
        
        // Match both possible general chat formats: '💬」general' or '💬」general-chat'
        const isGeneralChat = channelName === '💬」general' || channelName === '💬」general-chat';
        
        if (isGeneralChat && hasLevel25 && tenorLinkCheck) {
            // Skip the GIF check for Tenor links in general chat for users with Level 25
                            // Debug: console.log(`[GIF Debug] Skipping GIF check for Level 25 user ${message.author.tag} posting Tenor link in general`);
            shouldCheckGifs = false;
        }

        if (shouldCheckGifs && (
            message.content.includes('.gif') || 
            message.attachments.some(attachment => attachment.url.toLowerCase().endsWith('.gif')) ||
            gifRegex.test(message.content)
        )) {
            
            // Debug logging to see what's happening
            // Debug: console.log(`[GIF Debug] User ${message.author.tag} posted GIF content: ${message.content.substring(0, 100)}`);
            // Debug: console.log(`[GIF Debug] URL detection: tenor=${tenorLinkCheck}, regex=${gifRegex.test(message.content)}`);
            // Debug: console.log(`[GIF Debug] User roles: ${message.member.roles.cache.map(r => r.name).join(', ')}`);
            // Debug: console.log(`[GIF Debug] Channel name: ${channelName}`);
            
            const canUseGifs = await checkGifPermission(message.member, message.channel.name);
            // Debug: console.log(`[GIF Debug] Check result for ${message.author.tag}: ${canUseGifs}`);
            
            if (!canUseGifs) {
                await message.delete();
                await handleWarningMessage(message.channel, message.author.id, 'You don\'t have permission to send GIFs.', 'gif');
                return;
            }
        }
        
        // We'll let messageFilters handle link filtering now
    } catch (error) {
        await logger.error('MESSAGE_MODERATION', 'Error in message moderation', error);
    }
}

class MessageCreateEvent {
    constructor() {
        this.name = Events.MessageCreate;
        this.once = false;
    }

    async validateMessage(message) {
        // Ignore messages from bots
        if (message.author.bot) return false;

        // Ignore messages from webhooks
        if (message.webhookId) return false;

        // Ignore messages from system
        if (message.system) return false;

        return true;
    }

    async execute(message) {
        try {
            // Validate message
            if (!await this.validateMessage(message)) return;

            // Add a property to track if this message has been processed
            // This prevents multiple handlers from processing the same message
            if (message._processed) return;
            message._processed = true;

            // Award XP for this message (only in guild channels, not DMs)
            if (message.guild && !message.author.bot) {
                try {
                    const xpResult = await awardMessageXP(message.author.id, message.guild.id, message);
                    
                    // If user leveled up, send notification
                    if (xpResult.leveledUp) {
                        await sendLevelUpNotification(
                            message.author.id, 
                            message.guild.id,
                            xpResult.level,
                            message.client
                        );
                    }
                } catch (xpError) {
                    console.error('[MessageCreate] Error awarding XP:', xpError);
                }
            }

            // Handle ticket system for DMs
            if (message.channel.type === ChannelType.DM) {
                await handleTicketSystem(message);
                return;
            }

            // Handle staff reply
            await handleStaffReply(message);

            // Handle meme forwarding
            await forwardMeme(message);

            // Handle basic message moderation (stickers, GIFs)
            await handleMessageModeration(message);

            // Check for compromised accounts (cross-channel link spam detection)
            if (message.deletable) {
                const wasKicked = await checkForCompromisedAccount(message);
                if (wasKicked) {
                    // If user was kicked for compromise, stop processing this message
                    return;
                }
            }

            // Only call messageFilters if the message hasn't been deleted by handleMessageModeration
            if (message.deletable) {
                // Handle link filtering and other message filtering
                await messageFilters.filterMessage(message);
            }

        } catch (error) {
            console.error('Error processing message:', error);
            try {
                // Only report errors to users in a guild context, not in DMs
                if (message.guild) {
                    await message.channel.send({
                        content: `An error occurred while processing message. The error has been logged.`
                    }).then(msg => {
                        setTimeout(() => msg.delete().catch(() => {}), 5000);
                    }).catch(() => {});
                }
            } catch (msgError) {
                console.error('Error sending error message:', msgError);
            }
        }
    }
}

module.exports = new MessageCreateEvent();

// Export the DM/thread mapping
module.exports.userToThread = userToThread;
module.exports.threadToUser = threadToUser;
module.exports.recentlyClosedTickets = recentlyClosedTickets;
