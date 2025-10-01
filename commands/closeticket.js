const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Command framework
const { BaseCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorHandler');

// Helpers & services
const { checkModerationPermission } = require('../utils/commandHelpers');
const { userToThread, threadToUser, recentlyClosedTickets } = require('../events/messageCreate');
const ticketPersistence = require('../utils/ticketPersistence');

// Channel configuration
const channelConfig = require('../config/channels');

class CloseTicketCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('closeticket')
                .setDescription('Close and archive the ticket thread')
        );
    }

    shouldDeferReply() {
        return true;
    }

    isEphemeral() {
        return true;
    }

    shouldLogAction() {
        return true;
    }

    async validateInput(interaction) {
        // Check if user has Ticket Access role instead of using hierarchy
        const roleConfig = require('../config/roles');
        const hasTicketAccess = roleConfig.memberHasRole(interaction.member, 'TICKET_ACCESS');
        
        if (!hasTicketAccess) {
            throw createValidationError('You need the Ticket Access role to close tickets.');
        }
        
        const thread = interaction.channel;
        // Check if this is a thread and if it's a ticket thread (either starts with ticket- or is in the threadToUser map)
        if (!thread.isThread() || (!thread.name.startsWith('ticket-') && !threadToUser.has(thread.id))) {
            throw createValidationError('This command can only be used in a ticket thread.');
        }
        
        return { thread };
    }

    async executeCommand(interaction) {
        const { thread } = await this.validateInput(interaction);

        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ flags: ['Ephemeral'] });
            }

            // Get ticket owner information from our mapping
            const ticketOwnerId = threadToUser.get(thread.id) || thread.ownerId || interaction.user.id;
            
            // Mark this ticket as recently closed to prevent immediate reopening
            recentlyClosedTickets.set(ticketOwnerId, Date.now());
            
            // Clean up our maps using persistent system
            ticketPersistence.removeTicket(ticketOwnerId, thread.id);
            
            const ticketOwner = await interaction.guild.members.fetch(ticketOwnerId).catch(() => null);
            
            // Create a message that will be used as a marker
            const markerMessage = await thread.send('========= CLOSING TICKET =========');
            
            // Remove all members from the thread first
            try {
                // Fetch all thread members
                const threadMembers = await thread.members.fetch();
                
                // Remove each member one by one, except the bot itself
                for (const [memberId, member] of threadMembers) {
                    if (memberId !== interaction.client.user.id) {
                        await thread.members.remove(memberId);
                        // Small delay between removals to prevent rate limiting
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                }
                
                // Wait a bit for system messages to appear
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Fetch messages after the marker
                const messages = await thread.messages.fetch({ limit: 20 });
                const removalMessages = [];
                
                for (const [id, msg] of messages) {
                    // If the message is after our marker and is a system message or our marker
                    if (msg.createdTimestamp >= markerMessage.createdTimestamp) {
                        removalMessages.push(msg);
                    }
                }
                
                // Delete messages one by one, starting from the newest
                removalMessages.reverse();
                for (const msg of removalMessages) {
                    try {
                        // Skip system messages (can't be deleted by bots)
                        if (msg.system) {
                            continue;
                        }
                        await msg.delete();
                        // Small delay to prevent rate limiting
                        await new Promise(resolve => setTimeout(resolve, 300));
                    } catch (delError) {
                        // Ignore system message errors (50021)
                        if (delError.code !== 50021) {
                            console.error(`Failed to delete message ID ${msg.id}:`, delError);
                        }
                    }
                }
            } catch (removeError) {
                console.error('Error removing members from thread:', removeError);
                // Continue with closing even if there was an error removing members
            }
            
            // Lock the thread to prevent new messages
            await thread.setLocked(true, 'Ticket closed and locked');
            
            // Then archive thread
            if (!thread.archived) {
                await thread.setArchived(true, 'Ticket closed and archived');
            }

            // Send DM to the ticket owner if they exist
            let dmSent = false;
            if (ticketOwner) {
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor(0xFF5555) // Red color for closed tickets
                        .setTitle('Your Ticket Has Been Closed')
                        .setDescription(`Your ticket in **${interaction.guild.name}** has been closed by a staff member.`)
                        .addFields(
                            { name: 'Ticket', value: `${thread.name}`, inline: true },
                            { name: 'Closed By', value: `Staff Member`, inline: true },
                            { name: 'Closed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                        )
                        .setFooter({ text: 'If you have further questions, you can create a new ticket.' })
                        .setTimestamp();
                    
                    await ticketOwner.send({ embeds: [dmEmbed] });
                    dmSent = true;
                } catch (dmError) {
                    console.log(`Could not send DM to ticket owner (${ticketOwnerId}): ${dmError.message}`);
                    dmSent = false;
                }
            }

            let responseText = 'Ticket has been closed, locked, and archived. All members have been removed from the thread.';
            
            if (dmSent) {
                responseText += ' A notification has been sent to the ticket owner.';
            } else {
                responseText += ' Could not send notification to the ticket owner (they may have DMs disabled).';
            }
            
            await interaction.editReply({ content: responseText });

            // Log action
            await this.logAction(interaction, { thread, ticketOwner, moderator: interaction.user, dmSent });

            return {
                thread,
                ticketOwner: ticketOwner?.user || interaction.user,
                moderator: interaction.user,
                dmSent
            };
        } catch (error) {
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ content: 'An error occurred while processing your request.' });
            } else if (!interaction.replied) {
                await interaction.reply({ content: 'An error occurred while processing your request.', flags: ['Ephemeral'] });
            }
            console.error('Error closing ticket:', error);
            throw new Error('There was an error while closing the ticket: ' + error.message);
        }
    }

    async logAction(interaction, result) {
        const { thread, ticketOwner, moderator, dmSent } = result;
        
        // Get timestamp for log entry
        const timestamp = Math.floor(Date.now() / 1000);
        
        // Create log embed with clickable thread link
        const embed = new EmbedBuilder()
            .setColor(0x00FF00) // Green for successful closure
            .setDescription(`### **Ticket Log**`)
            .addFields(
                { name: "🎫 Ticket Closed & Locked", value: `**Ticket:** [${thread.name}](https://discord.com/channels/${interaction.guild.id}/${thread.id})`, inline: false },
                { name: "Owner", value: `<@${ticketOwner.id}> (${ticketOwner.username})`, inline: true },
                { name: "Closed By", value: `<@${moderator.id}>`, inline: true },
                { name: "Created At", value: `<t:${Math.floor(thread.createdTimestamp / 1000)}:F>`, inline: false },
                { name: "Closed At", value: `<t:${timestamp}:F>`, inline: false },
                { name: "Owner Notified", value: dmSent ? "✅ Yes" : "❌ No", inline: true },
                { name: "Ticket ID", value: `${thread.id} • <t:${timestamp}:R>`, inline: false }
            )
            .setTimestamp();

        // Get log channel from config
        const logChannelId = channelConfig.getId('TICKET_LOGS');
        const logChannel = interaction.guild.channels.cache.get(logChannelId);
        
        if (logChannel) {
            await logChannel.send({ embeds: [embed] });
        }
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

module.exports = new CloseTicketCommand();
