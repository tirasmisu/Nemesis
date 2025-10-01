const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ChannelType, PermissionsBitField, ButtonBuilder, ButtonStyle, EmbedBuilder, Events } = require('discord.js');
const commandManager = require('../utils/commandManager');
const { getModerationLogChannel } = require('../utils/utils');
const channelConfig = require('../config/channels');
const { checkModerationPermission } = require('../utils/commandHelpers');
const path = require('path');
const fs = require('fs');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // Handle chat input commands
        if (interaction.isChatInputCommand()) {
            return commandManager.handleCommand(interaction);
        }
        
        // Handle context menu commands
        if (interaction.isContextMenuCommand()) {
            try {
                // Load context menu command
                const contextMenusPath = path.join(__dirname, '..', 'contextMenus');
                const contextMenus = new Map();
                
                if (fs.existsSync(contextMenusPath)) {
                    const files = fs.readdirSync(contextMenusPath).filter(file => file.endsWith('.js'));
                    for (const file of files) {
                        const filePath = path.join(contextMenusPath, file);
                        const command = require(filePath);
                        if (command.data && command.data.name) {
                            contextMenus.set(command.data.name, command);
                        }
                    }
                }
                
                const contextCommand = contextMenus.get(interaction.commandName);
                if (!contextCommand) {
                    return interaction.reply({ 
                        content: 'Context menu command not found.', 
                        flags: ['Ephemeral']
                    });
                }
                
                await contextCommand.execute(interaction);
            } catch (error) {
                console.error(`Error executing context menu command ${interaction.commandName}:`, error);
                const errorMessage = 'There was an error while executing this context menu command.';
                
                try {
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ content: errorMessage, flags: ['Ephemeral'] });
                    } else {
                        await interaction.reply({ content: errorMessage, flags: ['Ephemeral'] });
                    }
                } catch (responseError) {
                    // Interaction might have expired or already been handled
                    console.error('Failed to respond to interaction:', responseError);
                }
            }
            return;
        }

        // Handle voice channel invitation buttons
        if (interaction.isButton() && (interaction.customId.startsWith('accept_invite_') || interaction.customId.startsWith('decline_invite_'))) {
            try {
                const { handleInvitationAccept, handleInvitationDecline } = require('../services/invitationService');
                
                if (interaction.customId.startsWith('accept_invite_')) {
                    const invitationId = interaction.customId.replace('accept_invite_', '');
                    return handleInvitationAccept(interaction, invitationId);
                } else if (interaction.customId.startsWith('decline_invite_')) {
                    const invitationId = interaction.customId.replace('decline_invite_', '');
                    return handleInvitationDecline(interaction, invitationId);
                }
            } catch (error) {
                console.error('Error handling invitation button interaction:', error);
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: 'This interaction has expired or is no longer valid.', flags: ['Ephemeral'] });
                    }
                } catch (responseError) {
                    console.error('Failed to respond to expired invitation interaction:', responseError);
                }
            }
        }

        // Handle voice channel join request buttons
        if (interaction.isButton() && (interaction.customId.startsWith('accept_join_') || interaction.customId.startsWith('decline_join_'))) {
            try {
                const { handleJoinRequestAccept, handleJoinRequestDecline } = require('../services/joinRequestService');
                
                if (interaction.customId.startsWith('accept_join_')) {
                    const requestId = interaction.customId.replace('accept_join_', '');
                    return handleJoinRequestAccept(interaction, requestId);
                } else if (interaction.customId.startsWith('decline_join_')) {
                    const requestId = interaction.customId.replace('decline_join_', '');
                    return handleJoinRequestDecline(interaction, requestId);
                }
            } catch (error) {
                console.error('Error handling join request button interaction:', error);
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: 'This interaction has expired or is no longer valid.', flags: ['Ephemeral'] });
                    }
                } catch (responseError) {
                    console.error('Failed to respond to expired join request interaction:', responseError);
                }
            }
        }

        // Handle nickname request button interaction
        if (interaction.isButton() && interaction.customId === 'request_nickname') {
            try {
                // Check cooldown and pending requests first
                const { canRequestNickname } = require('../utils/nicknameHelper');
                const cooldownCheck = await canRequestNickname(interaction.user.id, interaction.guild);
                if (!cooldownCheck.allowed) {
                    return interaction.reply({
                        content: cooldownCheck.message,
                        flags: ['Ephemeral']
                    });
                }

            // Check for existing active requests in the nickname requests channel
            const channelConfig = require('../config/channels');
            const nicknameRequestChannelId = channelConfig.getId('NICKNAME_REQUESTS');
            const nicknameRequestChannel = interaction.guild.channels.cache.get(nicknameRequestChannelId);

            if (!nicknameRequestChannel) {
                return interaction.reply({ 
                    content: 'Nickname request channel not found.', 
                    flags: ['Ephemeral'] 
                });
            }

            // Check for existing active requests
            const existingRequests = await nicknameRequestChannel.messages.fetch({ limit: 100 });
            const userActiveRequest = existingRequests.find(msg => 
                msg.embeds[0]?.description?.includes(`<@${interaction.user.id}>`) &&
                !msg.embeds[0]?.fields?.some(field => field.name === "Status")
            );

            if (userActiveRequest) {
                return interaction.reply({ 
                    content: 'You already have an active nickname request. Please wait for it to be reviewed.', 
                    flags: ['Ephemeral'] 
                });
            }

            // Create a modal for nickname submission (same as command)
            const modal = new ModalBuilder()
                .setCustomId('nickname_modal')
                .setTitle('Request Nickname Change');

            const nicknameInput = new TextInputBuilder()
                .setCustomId('nickname_input')
                .setLabel('Enter your desired nickname')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(32);

            const reasonInput = new TextInputBuilder()
                .setCustomId('reason_input')
                .setLabel('Why do you want this nickname?')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(500);

            const nicknameRow = new ActionRowBuilder().addComponents(nicknameInput);
            const reasonRow = new ActionRowBuilder().addComponents(reasonInput);
            modal.addComponents(nicknameRow, reasonRow);

            await interaction.showModal(modal);
            } catch (error) {
                console.error('Error handling nickname request button interaction:', error);
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: 'This interaction has expired or is no longer valid.', flags: ['Ephemeral'] });
                    }
                } catch (responseError) {
                    console.error('Failed to respond to expired nickname request interaction:', responseError);
                }
            }
        }

        // Handle modal submission
        if (interaction.isModalSubmit()) {
            try {
                const modalId = interaction.customId;
                // Handle different modal types
                switch (modalId) {
                    case 'nickname_modal':
                        // Handle nickname request from modal (works for both command and button)
                        const nickname = interaction.fields.getTextInputValue('nickname_input');
                        const reason = interaction.fields.getTextInputValue('reason_input') || 'No reason provided';
                        
                        // Use channel config to get the nickname requests channel
                        const channelConfig = require('../config/channels');
                        const nicknameRequestChannelId = channelConfig.getId('NICKNAME_REQUESTS');
                        const requestChannel = interaction.guild.channels.cache.get(nicknameRequestChannelId);
                        
                        if (!requestChannel) {
                            if (!interaction.replied && !interaction.deferred) {
                                await interaction.reply({
                                    content: 'Nickname request channel not found. Please contact an administrator.',
                                    flags: ['Ephemeral']
                                });
                            }
                            return;
                        }
                        
                        // Create an embed for the nickname request (consistent format)
                        const requestEmbed = new EmbedBuilder()
                            .setColor(0x0099FF)
                            .setTitle('Nickname Change Request')
                            .setDescription(`**User:** <@${interaction.user.id}> (${interaction.user.tag})\n**Requested Nickname:** ${nickname}\n**Reason:** ${reason}`)
                            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                            .setFooter({ text: `User ID: ${interaction.user.id}` })
                            .setTimestamp();
                        
                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`accept_nick_${interaction.user.id}_${nickname}`)
                                .setLabel('Accept')
                                .setStyle(ButtonStyle.Success),
                            new ButtonBuilder()
                                .setCustomId(`reject_nick_${interaction.user.id}`)
                                .setLabel('Reject')
                                .setStyle(ButtonStyle.Danger)
                        );
                        
                        await requestChannel.send({ 
                            embeds: [requestEmbed], 
                            components: [row] 
                        });
                        
                        // Update cooldown and track request activity after successful submission
                        const { updateNicknameCooldown, trackNicknameRequest } = require('../utils/nicknameHelper');
                        await updateNicknameCooldown(interaction.user.id);
                        await trackNicknameRequest(interaction.user.id);
                        
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({
                                content: `Your nickname request for "${nickname}" has been submitted to the staff team.`,
                                flags: ['Ephemeral']
                            });
                        }
                        break;
                    case 'reason_modal':
                        // Handle reason input
                        break;
                    case 'duration_modal':
                        // Handle duration input
                        break;
                    default:
                        // Handle emoji modals from the Add Reaction context menu
                        if (modalId.startsWith('emoji-modal-')) {
                            try {
                                const messageId = modalId.replace('emoji-modal-', '');
                                const customEmoji = interaction.fields.getTextInputValue('custom-emoji').trim();
                                
                                // Get the target message from the channel
                                const targetMessage = await interaction.channel.messages.fetch(messageId).catch(() => null);
                                
                                if (!targetMessage) {
                                    await interaction.reply({
                                        content: 'Could not find the message to add the reaction to.',
                                        flags: ['Ephemeral']
                                    });
                                    return;
                                }
                                
                                // Try to add the reaction
                                try {
                                    await targetMessage.react(customEmoji);
                                    await interaction.reply({
                                        content: `Added reaction: ${customEmoji}`,
                                        flags: ['Ephemeral']
                                    });
                                } catch (error) {
                                    await interaction.reply({
                                        content: `Failed to add reaction: ${customEmoji}. Make sure it's a valid emoji.`,
                                        flags: ['Ephemeral']
                                    });
                                }
                            } catch (error) {
                                console.error('Error handling emoji modal submission:', error);
                                if (!interaction.replied && !interaction.deferred) {
                                    await interaction.reply({
                                        content: 'An error occurred while adding the reaction.',
                                        flags: ['Ephemeral']
                                    });
                                }
                            }
                            return;
                        }
                        
                        // Handle reply modals from the Reply with Bot context menu
                        if (modalId.startsWith('reply-modal-')) {
                            try {
                                const messageId = modalId.replace('reply-modal-', '');
                                const replyContent = interaction.fields.getTextInputValue('reply-content');
                                
                                // Get the target message from the channel
                                const targetMessage = await interaction.channel.messages.fetch(messageId).catch(() => null);
                                
                                if (!targetMessage) {
                                    await interaction.reply({
                                        content: 'Could not find the message to reply to.',
                                        flags: ['Ephemeral']
                                    });
                                    return;
                                }
                                
                                // Send the reply as the bot
                                await targetMessage.reply({
                                    content: replyContent,
                                    allowedMentions: { repliedUser: true }
                                });
                                
                                await interaction.reply({
                                    content: 'Reply sent!',
                                    flags: ['Ephemeral']
                                });
                            } catch (error) {
                                console.error('Error handling reply modal submission:', error);
                                if (!interaction.replied && !interaction.deferred) {
                                    await interaction.reply({
                                        content: 'An error occurred while sending the reply.',
                                        flags: ['Ephemeral']
                                    });
                                }
                            }
                            return;
                        }
                        
                        console.log(`Unhandled modal submission: ${modalId}`);
                        // Don't try to reply here, as we might not know the modal structure
                }
            } catch (error) {
                console.error('Error handling modal submission:', error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'An error occurred while processing your request.',
                        flags: ['Ephemeral']
                    });
                }
            }
        }

        // Handle other button interactions (e.g., ticket creation)
        if (interaction.isButton() && interaction.customId === 'open_ticket') {
            const user = interaction.user;
            const guild = interaction.guild;

            // Look for the category called "Ticket"
            const ticketCategory = guild.channels.cache.find(channel => channel.name.toLowerCase() === 'tickets' && channel.type === ChannelType.GuildCategory);

            // Ensure the category exists
            if (!ticketCategory) {
                return interaction.reply({ content: 'Ticket category not found. Please create a category named "Ticket".', flags: ['Ephemeral'] });
            }

            // Use the Ticket Access role ID directly
            const TICKET_ACCESS_ROLE_ID = '1277791038756487179';
            
            // Ensure the role exists
            const ticketRole = guild.roles.cache.get(TICKET_ACCESS_ROLE_ID);
            if (!ticketRole) {
                return interaction.reply({ content: 'Ticket Access role not found. Please check the role ID.', flags: ['Ephemeral'] });
            }

            // Create a unique ticket name with date
            const date = new Date();
            const dateTag = `${date.toISOString().split('T')[0].replace(/-/g, '')}`;
            const ticketName = `ticket-${user.username}-${dateTag}`;

            // Check if a ticket already exists for the user
            const existingChannel = guild.channels.cache.find(channel => 
                channel.name.startsWith(`ticket-${user.username}`) && 
                !channel.archived
            );
            
            if (existingChannel) {
                return interaction.reply({ content: `You already have an open ticket: <#${existingChannel.id}>`, flags: ['Ephemeral'] });
            }

            try {
                // Create the ticket channel within the "Ticket" category
                const ticketChannel = await guild.channels.create({
                    name: ticketName,
                    type: ChannelType.GuildText,
                    parent: ticketCategory.id, // Set the category
                    topic: `Ticket for ${user.tag} • Created ${date.toLocaleString()}`,
                    permissionOverwrites: [
                        {
                            id: guild.roles.everyone.id,
                            deny: [PermissionsBitField.Flags.ViewChannel], // Hide the channel from everyone
                        },
                        {
                            id: user.id,
                            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                        },
                        {
                            id: ticketRole.id,
                            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                        },
                    ],
                });

                // Notify the Ticket role with a message that stays instead of being deleted
                await ticketChannel.send(`<@&${TICKET_ACCESS_ROLE_ID}> New conversation initiated for <@${user.id}>.`);

                // Send a welcome message to the user that's clearly from the bot
                await ticketChannel.send(`Thank you <@${user.id}> for reaching out. Our staff has been notified and will respond shortly.`);

                // Automatically place the user into the new channel
                await interaction.reply({ content: `Your ticket has been created: <#${ticketChannel.id}>`, flags: ['Ephemeral'] });

                // Log the ticket creation
                const logChannelId = channelConfig.getId('TICKET_LOGS');
                const logChannel = guild.channels.cache.get(logChannelId);
                
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor(0x00FFFF)
                        .setDescription(`### **Ticket Created**`)
                        .addFields(
                            { name: "🎫 Ticket", value: `[${ticketName}](https://discord.com/channels/${guild.id}/${ticketChannel.id})`, inline: false },
                            { name: "Created By", value: `<@${user.id}> (${user.username})`, inline: true },
                            { name: "Created At", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
                            { name: "Ticket ID", value: `${ticketChannel.id} • <t:${Math.floor(Date.now() / 1000)}:R>`, inline: false }
                        )
                        .setTimestamp();
                    await logChannel.send({ embeds: [logEmbed] });
                }

            } catch (error) {
                console.error('Error creating ticket channel:', error);
                await interaction.reply({ content: 'There was an error while creating your ticket.', flags: ['Ephemeral'] });
            }
        }

        // Handle role assignment from select menu
        else if (interaction.isStringSelectMenu() && interaction.customId === 'select_role') {
            const selectedRoleId = interaction.values[0]; // Get the selected role ID
            const targetUserId = interaction.message.mentions.users.first()?.id; // Get the user ID from the message mention

            if (!targetUserId) {
                console.error('Could not find the user ID in the message.');
                return interaction.update({ content: 'Could not find the user to assign the role to.', components: [] });
            }

            try {
                const member = await interaction.guild.members.fetch(targetUserId); // Fetch the target user by ID
                const role = await interaction.guild.roles.fetch(selectedRoleId); // Get the selected role

                await member.roles.add(role); // Assign the role to the target user
                await interaction.update({ content: `Assigned the role **${role.name}** to <@${member.id}>.`, components: [] });
            } catch (error) {
                console.error('Error assigning role:', error);
                await interaction.update({ content: 'There was an error assigning the role.', components: [] });
            }
        }

        // Handle role removal from select menu
        else if (interaction.isStringSelectMenu() && interaction.customId === 'select_role_to_remove') {
            const selectedRoleId = interaction.values[0]; // Get the selected role ID
            const targetUserId = interaction.message.mentions.users.first()?.id; // Get the user ID from the message mention

            if (!targetUserId) {
                console.error('Could not find the user ID in the message.');
                return interaction.update({ content: 'Could not find the user to remove the role from.', components: [] });
            }

            try {
                const member = await interaction.guild.members.fetch(targetUserId); // Fetch the target user by ID
                const role = await interaction.guild.roles.fetch(selectedRoleId); // Get the selected role

                await member.roles.remove(role); // Remove the role from the target user
                await interaction.update({ content: `Removed the role **${role.name}** from <@${member.id}>.`, components: [] });
            } catch (error) {
                console.error('Error removing role:', error);
                await interaction.update({ content: 'There was an error removing the role.', components: [] });
            }
        }

        // Handle button interactions
        if (interaction.isButton()) {
            // Handle sendblacklist pagination buttons
            if (interaction.customId.startsWith('sendblacklist_page_')) {
                try {
                    // Extract page number from custom ID
                    const pageNumber = parseInt(interaction.customId.replace('sendblacklist_page_', ''));
                    
                    // Import BlacklistWord model
                    const BlacklistWord = require('../models/BlacklistWord');
                    
                    // Check permissions
                    if (!await checkModerationPermission(interaction, 'helpers')) {
                        return interaction.reply({
                            content: 'You do not have permission to use this button.',
                            flags: ['Ephemeral']
                        });
                    }
                    
                    // Get total count of blacklisted words
                    const totalWords = await BlacklistWord.countDocuments();
                    
                    if (totalWords === 0) {
                        return interaction.update({
                            content: 'No blacklisted words found in the database.',
                            components: []
                        });
                    }
                    
                    // Pagination settings
                    const wordsPerPage = 50;
                    const totalPages = Math.ceil(totalWords / wordsPerPage);
                    
                    // Validate page number
                    if (pageNumber < 1 || pageNumber > totalPages) {
                        return interaction.reply({
                            content: `Invalid page number. Please choose between 1 and ${totalPages}.`,
                            flags: ['Ephemeral']
                        });
                    }
                    
                    // Calculate skip value for pagination
                    const skip = (pageNumber - 1) * wordsPerPage;
                    
                    // Fetch words from database with pagination
                    const words = await BlacklistWord.find({})
                        .select('word addedBy addedAt')
                        .sort({ addedAt: -1 }) // Most recent first
                        .skip(skip)
                        .limit(wordsPerPage)
                        .lean();
                    
                    // Create the embed
                    const embed = new EmbedBuilder()
                        .setColor(0xFF5555)
                        .setTitle('🚫 Blacklisted Words Database')
                        .setDescription(`Showing page ${pageNumber} of ${totalPages} (${totalWords} total words)`)
                        .setTimestamp();
                    
                    // Group words into chunks for better readability
                    const wordsPerField = 25;
                    const fieldChunks = [];
                    
                    for (let i = 0; i < words.length; i += wordsPerField) {
                        const chunk = words.slice(i, i + wordsPerField);
                        fieldChunks.push(chunk);
                    }
                    
                    // Add fields to embed
                    fieldChunks.forEach((chunk, index) => {
                        const wordList = chunk.map((wordDoc, wordIndex) => {
                            const globalIndex = (pageNumber - 1) * wordsPerPage + (index * wordsPerField) + wordIndex + 1;
                            return `${globalIndex}. \`${wordDoc.word}\``;
                        }).join('\n');
                        
                        const fieldTitle = fieldChunks.length === 1 ? 'Words' : `Words (${index * wordsPerField + 1}-${Math.min((index + 1) * wordsPerField, chunk.length + index * wordsPerField)})`;
                        
                        embed.addFields({
                            name: fieldTitle,
                            value: wordList,
                            inline: false
                        });
                    });
                    
                    // Add pagination info
                    embed.setFooter({
                        text: `Page ${pageNumber}/${totalPages} • Total: ${totalWords} words • Click buttons to navigate`
                    });
                    
                    // Create navigation buttons if there are multiple pages
                    let components = [];
                    if (totalPages > 1) {
                        const row = new ActionRowBuilder();
                        
                        // Previous page button
                        if (pageNumber > 1) {
                            row.addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`sendblacklist_page_${pageNumber - 1}`)
                                    .setLabel('← Previous')
                                    .setStyle(ButtonStyle.Secondary)
                            );
                        }
                        
                        // Page indicator
                        row.addComponents(
                            new ButtonBuilder()
                                .setCustomId('sendblacklist_current_page')
                                .setLabel(`${pageNumber}/${totalPages}`)
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(true)
                        );
                        
                        // Next page button
                        if (pageNumber < totalPages) {
                            row.addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`sendblacklist_page_${pageNumber + 1}`)
                                    .setLabel('Next →')
                                    .setStyle(ButtonStyle.Secondary)
                            );
                        }
                        
                        components = [row];
                    }
                    
                    await interaction.update({
                        embeds: [embed],
                        components: components
                    });
                    
                } catch (error) {
                    console.error('Error handling sendblacklist pagination:', error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: 'An error occurred while loading the blacklist page.',
                            flags: ['Ephemeral']
                        });
                    }
                }
                return;
            }
            
            // Check if it's a nickname request button
            if (interaction.customId.startsWith('accept_nick_') || interaction.customId.startsWith('reject_nick_')) {
                const [action, type, userId, ...nicknameParts] = interaction.customId.split('_');
                let nickname = nicknameParts.join('_');

                // Check if user has helper permissions or higher
                if (!await checkModerationPermission(interaction, 'helpers')) {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: 'You do not have permission to use this button.',
                            flags: ['Ephemeral']
                        });
                    }
                    return;
                }

                try {
                    const member = await interaction.guild.members.fetch(userId);
                    
                    // For reject button, extract nickname from the original embed since it's not in the customId
                    if (action === 'reject' && !nickname) {
                        const originalEmbed = interaction.message.embeds[0];
                        if (originalEmbed && originalEmbed.description) {
                            // Extract nickname from original embed description
                            const descriptionMatch = originalEmbed.description.match(/\*\*Requested Nickname:\*\* (.+?)(?:\n|$)/);
                            if (descriptionMatch) {
                                nickname = descriptionMatch[1];
                            }
                        }
                    }
                    
                    if (action === 'accept') {
                        try {
                            // Verify member object is valid and has the setNickname method
                            if (member && typeof member.setNickname === 'function') {
                                await member.setNickname(nickname);
                                
                                // Clear the user's cooldown and track request activity
                                const { clearNicknameCooldown, trackNicknameRequest } = require('../utils/nicknameHelper');
                                await clearNicknameCooldown(userId);
                                await trackNicknameRequest(userId);
                                
                                // Create an updated embed with the original format
                                const updatedEmbed = new EmbedBuilder()
                                    .setColor(0x00FF00)
                                    .setTitle('Nickname Change Request')
                                    .setDescription(`<@${userId}> has requested a nickname change to ${nickname}`)
                                    .setThumbnail(member.displayAvatarURL({ dynamic: true }))
                                    .addFields(
                                        { name: 'Accepted by', value: `<@${interaction.user.id}>` }
                                    )
                                    .setTimestamp();
                                
                                await interaction.update({
                                    embeds: [updatedEmbed],
                                    components: []
                                });
                                
                                try {
                                    await member.send(`Your nickname request has been accepted! Your new nickname is: ${nickname}`);
                                } catch (error) {
                                    console.error('Could not DM user about nickname acceptance:', error);
                                }
                            } else {
                                console.error(`Invalid member object or setNickname not a function for user ID: ${userId}`);
                                if (!interaction.replied && !interaction.deferred) {
                                    await interaction.reply({
                                        content: 'Error: Could not update nickname. User might not be in the server anymore.',
                                        flags: ['Ephemeral']
                                    });
                                }
                            }
                        } catch (error) {
                            console.error(`Failed to set nickname for ${member?.user?.tag || userId}:`, error);
                            if (!interaction.replied && !interaction.deferred) {
                                await interaction.reply({
                                    content: `Error setting nickname: ${error.message}`,
                                    flags: ['Ephemeral']
                                });
                            }
                        }
                    } else if (action === 'reject') {
                        // Clear the user's cooldown and track request activity
                        const { clearNicknameCooldown, trackNicknameRequest } = require('../utils/nicknameHelper');
                        await clearNicknameCooldown(userId);
                        await trackNicknameRequest(userId);
                        
                        // Create an updated embed with the original format
                        const updatedEmbed = new EmbedBuilder()
                            .setColor(0xFF0000)
                            .setTitle('Nickname Change Request')
                            .setDescription(`<@${userId}> has requested a nickname change to ${nickname}`)
                            .setThumbnail(member.displayAvatarURL({ dynamic: true }))
                            .addFields(
                                { name: 'Rejected by', value: `<@${interaction.user.id}>` }
                            )
                            .setTimestamp();
                            
                        await interaction.update({
                            embeds: [updatedEmbed],
                            components: []
                        });
                        
                        try {
                            await member.send('Your nickname request has been rejected by the staff team.');
                        } catch (error) {
                            console.error('Could not DM user about nickname rejection:', error);
                        }
                    }
                } catch (error) {
                    console.error('Error handling nickname request:', error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: 'An error occurred while processing the nickname request.',
                            flags: ['Ephemeral']
                        });
                    }
                }
            }
        }
    }
}
