const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Command framework
const { BaseCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorHandler');

// Helpers & services
const { checkModerationPermission } = require('../utils/commandHelpers');
const { generateUniquePunishmentId } = require('../utils/generatePunishmentId');
const { saveModerationAction } = require('../services/moderationActionService');

// Channel configuration
const channelConfig = require('../config/channels');

class PurgeUserCommand extends BaseCommand {
    constructor() {
        super(new SlashCommandBuilder()
            .setName('purgeuser')
            .setDescription('Deletes all messages from a specific user in the current channel')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('The user whose messages to delete')
                    .setRequired(true))
            .addIntegerOption(option =>
                option.setName('amount')
                    .setDescription('The number of messages to check (1-100)')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(100)));
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
        if (!await checkModerationPermission(interaction, 'mods')) {
            throw createValidationError('You do not have permission to use this command');
        }

        const user = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        // Check if channel is text channel
        if (!interaction.channel.isTextBased()) {
            throw createValidationError("This command can only be used in text channels.");
        }

        return { user, amount };
    }

    async execute(interaction) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ flags: ['Ephemeral'] });
            }
            const validation = await this.validateInput(interaction);
            if (!validation) return;
            const { user, amount } = validation;

            // Fetch and delete messages
            const messages = await interaction.channel.messages.fetch({ limit: amount });
            const userMessages = messages.filter(msg => msg.author.id === user.id);
            
            // Create a transcript of the messages before deletion
            const transcript = [];
            userMessages.forEach(msg => {
                const timestamp = new Date(msg.createdTimestamp).toLocaleString();
                let content = msg.content || '';
                
                // If message has no content but has attachments or embeds, note that
                if (!content && (msg.attachments.size > 0 || msg.embeds.length > 0)) {
                    content = '[No text content]';
                }
                
                transcript.push(`[${timestamp}] ${msg.author.tag}: ${content}`);
                
                // Add attachments if any
                if (msg.attachments.size > 0) {
                    msg.attachments.forEach(attachment => {
                        transcript.push(`  [Attachment] ${attachment.name || 'unnamed'}: ${attachment.url}`);
                    });
                }
                
                // Add embeds summary if any
                if (msg.embeds.length > 0) {
                    transcript.push(`  [${msg.embeds.length} embed${msg.embeds.length > 1 ? 's' : ''}]`);
                }
                transcript.push('-------------------');
            });
            
            // Join transcript into a string
            const transcriptContent = transcript.length > 0 ? transcript.join('\n') : 'No messages found to purge';
            
            // Delete the messages
            const deletedMessages = await interaction.channel.bulkDelete(userMessages, true);
            
            // Generate punishment ID
            const punishmentId = await generateUniquePunishmentId();

            // Save action to database
            await saveModerationAction({
                userId: user.id,
                moderatorId: interaction.user.id,
                action: 'purge_user',
                reason: `Purged ${deletedMessages.size} messages from ${user.tag} in #${interaction.channel.name}`,
                actionId: punishmentId,
            });

            // Create moderation embed
            const embed = new EmbedBuilder()
                .setColor(0x00FFFF) // Cyan for purge
                .setDescription(`### **Moderation Log**`)
                .setFooter({ text: `Punishment ID: ${punishmentId}` })
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: "🧹 User Messages Purged", value: `**User:** <@${user.id}> (${user.tag})`, inline: true },
                    { name: "Amount", value: `${amount} messages`, inline: true },
                    { name: "Channel", value: `${interaction.channel}`, inline: true },
                    { name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
                    { name: "Time", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                )
                .setTimestamp();

            // Get log channel from config
            const logChannelId = channelConfig.getId('MODERATION_LOG');
            const logChannel = interaction.guild.channels.cache.get(logChannelId);
            
            if (logChannel) {
                // If no messages were actually purged
                if (amount === 0 || !transcript || transcript === 'No messages found to purge') {
                    embed.addFields({ name: "Message Content", value: "*No messages were purged*", inline: false });
                    await logChannel.send({ embeds: [embed] });
                } else {
                    // If transcript is small enough, add it as a field
                    if (transcript.length < 1000) {
                        embed.addFields({ name: "Message Content", value: `\`\`\`\n${transcript.substring(0, 1000)}\n\`\`\``, inline: false });
                        await logChannel.send({ embeds: [embed] });
                    } else {
                        // If transcript is too large, create a file
                        const transcriptFileName = `purge-${user.id}-${Date.now()}.txt`;
                        const transcriptBuffer = Buffer.from(transcript, 'utf-8');
                        
                        // Send embed with transcript file attached
                        await logChannel.send({ 
                            embeds: [embed],
                            files: [{
                                attachment: transcriptBuffer,
                                name: transcriptFileName,
                                description: `Purged messages from ${user.tag}`
                            }]
                        });
                    }
                }
            }

            await interaction.editReply({
                content: `Successfully deleted ${amount} messages from ${user.tag}.`,
                flags: ['Ephemeral']
            });
        } catch (error) {
            // Only log or throw, do not reply here
            console.error('[PURGEUSER] Error:', error);
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ content: 'An error occurred while processing your request.' });
            } else if (!interaction.replied) {
                await interaction.reply({ content: 'An error occurred while processing your request.', flags: ['Ephemeral'] });
            }
            throw error;
        }
    }
}

module.exports = new PurgeUserCommand();
