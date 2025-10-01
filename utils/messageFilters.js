const { handleCommandError } = require('./errorManager');
const channelConfig = require('../config/channels');
const blacklistHelper = require('./blacklistHelper');
const { EmbedBuilder } = require('discord.js');
const { saveModerationAction, deactivateAction, findActiveAction } = require('../services/moderationActionService');
const { generateUniquePunishmentId } = require('./generatePunishmentId');
const logger = require('./logger');

// Constants for link filtering
const ALLOWED_MUSIC_LINKS = [
    'spotify.com',
    'music.apple.com',
    'youtube.com',
    'youtu.be',
    'soundcloud.com',
    'tidal.com'
];

// Blacklist violation tracking
// Map of userId to { count: number, lastViolation: timestamp }
const blacklistViolations = new Map();

// Auto-mute thresholds
const VIOLATION_THRESHOLD = 3; // Number of violations before auto-mute
const VIOLATION_WINDOW = 10 * 60 * 1000; // 10 minutes in milliseconds
const DEFAULT_MUTE_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds

// Define severe blacklisted words that get immediate, harsher punishment
const SEVERE_BLACKLISTED_WORDS = [
    'nigger',
    'nigga',
    'negro',
    'nig nog'
];

// Severe violation settings
const SEVERE_MUTE_DURATION = 120 * 60 * 1000; // 2 hours in milliseconds for first offense
const SEVERE_MUTE_MULTIPLIER = 2; // Each repeat offense multiplies the duration by this factor

// Track severe violations separately
const severeViolations = new Map();

class MessageFilters {
    constructor() {
        this.linkRegex = /(https?:\/\/[^\s]+)/g;
        this.discordLinkRegex = /discord\.com\/channels\/(\d+)\/\d+\/\d+/;
        this.discordInviteRegex = /discord(?:\.gg|\.com\/invite)\/([a-zA-Z0-9-]+)/i;
        this.bypassRoles = ['Admins', 'Moderators', 'Helpers', 'T', 'TraniumBot', 'Senior Moderators', 'Trial Helpers'];
    }

    containsLink(content) {
        if (!content || typeof content !== 'string') return false;
        return this.linkRegex.test(content);
    }

    containsBypass(member) {
        if (!member || !member.roles || !member.roles.cache) return false;
        const roleConfig = require('../config/roles');
        const bypassRoleIds = roleConfig.getBypassRoleIds();
        return member.roles.cache.some(role => 
            bypassRoleIds.includes(role.id)
        );
    }

    sanitizeText(text) {
        if (!text || typeof text !== 'string') return '';
        return text
            .replace(/[^\w\s]/gi, '')
            .trim();
    }

    // Track blacklist violations
    trackBlacklistViolation(userId) {
        const now = Date.now();
        const userData = blacklistViolations.get(userId) || { count: 0, lastViolation: 0 };
        
        // Reset count if last violation was outside the window
        if (now - userData.lastViolation > VIOLATION_WINDOW) {
            userData.count = 0;
        }
        
        // Increment count and update timestamp
        userData.count++;
        userData.lastViolation = now;
        
        blacklistViolations.set(userId, userData);
        
        return userData;
    }
    
    // Track severe violations
    trackSevereViolation(userId) {
        const userData = severeViolations.get(userId) || { count: 0 };
        
        // Increment count - severe violations don't reset with time
        userData.count++;
        
        severeViolations.set(userId, userData);
        
        return userData;
    }
    
    // Check if content contains severe blacklisted words
    containsSevereBlacklistedWord(content) {
        if (!content || typeof content !== 'string') return { found: false };
        
        const normalizedContent = content.toLowerCase();
        const foundWords = [];
        
        for (const word of SEVERE_BLACKLISTED_WORDS) {
            if (normalizedContent.includes(word)) {
                foundWords.push(word);
            }
        }
        
        return {
            found: foundWords.length > 0,
            words: foundWords
        };
    }

    // Check if content contains a Discord invite link
    containsDiscordInvite(content) {
        if (!content || typeof content !== 'string') return false;
        
        // Check for standard discord invite links
        if (this.discordInviteRegex.test(content)) return true;
        
        // Also check for bare discord.gg links (without http/https)
        const bareDiscordGgRegex = /discord\.gg\/([a-zA-Z0-9-]+)/i;
        return bareDiscordGgRegex.test(content);
    }

    // Auto-mute user for repeated violations
    async autoMuteUser(message, violationCount, isSevere = false) {
        try {
            const member = message.member;
            const guild = message.guild;
            
            // Find the muted role
            const mutedRole = guild.roles.cache.find(role => 
                role.name === 'Muted' || role.name === 'Timeout'
            );
            
            if (!mutedRole) {
                console.error('[AutoMute] Could not find muted role');
                return false;
            }
            
            // Apply muted role
            await member.roles.add(mutedRole);
            
            let muteDuration;
            let reason;
            
            if (isSevere) {
                // Get number of severe violations
                const severeCount = this.trackSevereViolation(member.id).count;
                
                // Calculate severe mute duration (doubles with each offense)
                muteDuration = SEVERE_MUTE_DURATION * Math.pow(SEVERE_MUTE_MULTIPLIER, severeCount - 1);
                reason = `Auto-muted for using severe racial slurs (${severeCount} total offenses)`;
            } else {
                // Calculate standard mute duration (increases with violation count)
                muteDuration = DEFAULT_MUTE_DURATION * Math.min(violationCount - VIOLATION_THRESHOLD + 1, 5);
                reason = `Auto-muted for ${violationCount} blacklist violations in ${VIOLATION_WINDOW/60000} minutes`;
            }
            
            const formattedDuration = Math.ceil(muteDuration / 60000) + ' minutes';
            
            // Create mute notification embed
            const muteEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Automated Mute')
                .setDescription(`${member.user.tag} has been auto-muted for ${formattedDuration} for ${isSevere ? 'using severe prohibited language' : 'repeatedly posting blacklisted content'}.`)
                .addFields(
                    { name: 'User', value: `<@${member.id}>`, inline: true },
                    { name: 'Duration', value: formattedDuration, inline: true }
                )
                .setTimestamp();
                
            // Send notification to channel
            const notificationMessage = await message.channel.send({ embeds: [muteEmbed] });
            
            // Delete notification after 10 seconds
            setTimeout(() => {
                notificationMessage.delete().catch(() => {});
            }, 10000);
            
            // Save to moderation log - use 'mute' action to be compatible with unmute command
            const punishmentId = await generateUniquePunishmentId();
            await saveModerationAction({
                userId: member.id,
                moderatorId: guild.client.user.id, // Bot's ID
                action: 'mute', // Using 'mute' instead of 'auto_mute' so unmute command can find it
                reason: reason,
                duration: muteDuration,
                actionId: punishmentId
            }).catch(console.error);
            
            // Set up unmute timer
            setTimeout(async () => {
                try {
                    // Check if user still has the role and is still in the guild
                    const currentMember = await guild.members.fetch(member.id).catch(() => null);
                    if (currentMember && currentMember.roles.cache.has(mutedRole.id)) {
                        await currentMember.roles.remove(mutedRole);
                        console.log(`[AutoMute] Unmuted ${member.user.tag} after ${formattedDuration}`);
                        
                        // Update database to mark mute as inactive
                        try {
                            await deactivateAction(punishmentId);
                            console.log(`[AutoMute] Successfully marked mute ${punishmentId} as inactive in database`);
                        } catch (dbError) {
                            console.error('[AutoMute] Error updating database on unmute:', dbError);
                        }
                    }
                } catch (error) {
                    console.error('[AutoMute] Error unmuting user:', error);
                }
            }, muteDuration);
            
            return true;
        } catch (error) {
            console.error('[AutoMute] Error auto-muting user:', error);
            return false;
        }
    }

    // Check if content contains a Discord message link and validate if it's from the same server
    isAllowedDiscordLink(content, guildId) {
        if (!content || typeof content !== 'string') return false;
        
        const match = content.match(this.discordLinkRegex);
        if (!match) return false;
        
        // If the link is from the same guild, it's allowed
        const linkGuildId = match[1];
        return linkGuildId === guildId;
    }

    async filterMessage(message) {
        try {
            // Make sure message exists and has needed properties
            if (!message || !message.content) return;
            
            // Skip bot messages - add a double check to be absolutely sure
            if (message.author?.bot || message.author?.id === message.client.user.id) return;

            // Skip if message was sent in DM (no member property)
            if (!message.member || !message.guild) return;

            // Skip if user has bypass role
            if (this.containsBypass(message.member)) return;
            
            // Skip if this message was already filtered (prevents duplicate warnings)
            if (message._blacklistFiltered) return;

            // Check for Discord invite links first - high priority
            if (this.containsDiscordInvite(message.content)) {
                try {
                    console.log(`[InviteFilter] Detected Discord invite from ${message.author.tag}: ${message.content}`);
                    
                    // Delete the message immediately
                    await message.delete().catch(err => {
                        if (err.code !== 10008) { // Not "Unknown Message" error
                            console.error('Error deleting Discord invite message:', err);
                        }
                    });
                    
                    // Track this as a blacklist violation - these are similar to blacklisted words
                    const violation = this.trackBlacklistViolation(message.author.id);
                    
                    // Send warning message
                    let warningContent = `${message.author}, posting Discord invite links is not allowed.`;
                    
                    // Add escalating warning for repeated violations
                    if (violation.count >= 2 && violation.count < VIOLATION_THRESHOLD) {
                        warningContent += `\n⚠️ Warning: This is your ${violation.count}nd/rd violation. ${VIOLATION_THRESHOLD} violations will result in an automatic mute.`;
                    }
                    
                    const warningMessage = await message.channel.send({
                        content: warningContent
                    });
                    
                    // Delete warning after 5 seconds
                    setTimeout(() => {
                        warningMessage.delete().catch(() => {});
                    }, 5000);
                    
                    // Check if we should auto-mute
                    if (violation.count >= VIOLATION_THRESHOLD) {
                        await this.autoMuteUser(message, violation.count);
                    }
                    
                    return;
                } catch (deleteError) {
                    if (deleteError.code !== 10008) {
                        console.error('Error handling Discord invite link:', deleteError);
                    }
                }
            }

            // Check media channels for text-only messages (no media)
            const memesId = channelConfig.getId('MEMES');
            const mediaId = channelConfig.getId('MEDIA');
            
            if ((message.channel.id === memesId || message.channel.id === mediaId) && 
                message.attachments.size === 0 && 
                !message.embeds.some(embed => embed.type === 'image' || embed.type === 'video' || embed.image || embed.video)) {
                
                // It's a text-only message in a media channel
                // Check if it has a tenor/gif link in it
                const hasGifLink = /tenor\.com\/view|giphy\.com\/gifs|gfycat\.com|\.gif/i.test(message.content);
                
                // If no gif link, delete it as it's text only
                if (!hasGifLink) {
                    try {
                        const channelName = message.channel.name;
                        console.log(`[MediaFilter] Deleting text-only message from ${message.author.tag} in ${channelName} channel`);
                        
                        // Delete the message immediately without waiting
                        await message.delete();
                        
                        // Send warning
                        const warningMessage = await message.channel.send({
                            content: `${message.author}, this channel is for media/images only. Text-only messages are not allowed. 💀`
                        });
                        
                        // Delete warning after 5 seconds
                        setTimeout(() => {
                            warningMessage.delete().catch(() => {});
                        }, 5000);
                        
                        return;
                    } catch (deleteError) {
                        console.error('[MediaFilter] Error deleting text-only message in media channel:', deleteError);
                    }
                }
            }
            
            // First check for severe blacklisted words (racial slurs)
            const severeCheck = this.containsSevereBlacklistedWord(message.content);
            if (severeCheck.found) {
                try {
                    // Mark message as filtered to prevent duplicate processing
                    message._blacklistFiltered = true;
                    
                    // Delete the message immediately
                    await message.delete().catch(err => {
                        if (err.code !== 10008) {
                            console.error('Error deleting message with severe blacklisted word:', err);
                        }
                    });
                    
                    console.log(`[BlacklistFilter] Removed message from ${message.author.tag} containing severe prohibited words: ${severeCheck.words.join(', ')}`);
                    
                    // Apply immediate mute with severe punishment
                    await this.autoMuteUser(message, 1, true);
                    
                    return;
                } catch (deleteError) {
                    if (deleteError.code !== 10008) {
                        console.error('Error deleting message with severe blacklisted word:', deleteError);
                    }
                }
            }

            // Check for regular blacklisted words
            const blacklistCheck = blacklistHelper.containsBlacklistedWord(message.content);
            if (blacklistCheck.found) {
                try {
                    // Mark message as filtered to prevent duplicate processing
                    message._blacklistFiltered = true;
                    
                    // Track this violation
                    const violation = this.trackBlacklistViolation(message.author.id);
                    console.log(`[BlacklistFilter] User ${message.author.tag} has ${violation.count} violations in the last ${VIOLATION_WINDOW/60000} minutes`);
                    
                    // Delete the message immediately
                    await message.delete().catch(err => {
                        // Only log if it's not an Unknown Message error (already deleted)
                        if (err.code !== 10008) {
                            console.error('Error deleting message with blacklisted word:', err);
                        }
                    });
                    
                    // Generate a unique ID for this warning to prevent duplicates
                    const warningId = `${message.author.id}-${Date.now()}`;
                    if (message.channel._warningsSent && message.channel._warningsSent.has(warningId)) {
                        console.log(`[BlacklistFilter] Skipping duplicate warning for ID ${warningId}`);
                        return;
                    }
                    
                    // Initialize warnings set if needed
                    if (!message.channel._warningsSent) {
                        message.channel._warningsSent = new Set();
                    }
                    
                    // Add this warning to the set
                    message.channel._warningsSent.add(warningId);
                    
                    // Send warning message
                    let warningContent = `${message.author}, your message was removed because it contains prohibited words.`;
                    
                    // Add escalating warning for repeated violations
                    if (violation.count >= 2 && violation.count < VIOLATION_THRESHOLD) {
                        warningContent += `\n⚠️ Warning: This is your ${violation.count}nd/rd violation. ${VIOLATION_THRESHOLD} violations will result in an automatic mute.`;
                    }
                    
                    const warningMessage = await message.channel.send({
                        content: warningContent
                    });
                    
                    // Delete warning after 5 seconds
                    setTimeout(() => {
                        warningMessage.delete().catch(() => {});
                        // Also clean up the warning ID after some time to prevent memory leaks
                        setTimeout(() => {
                            if (message.channel._warningsSent) {
                                message.channel._warningsSent.delete(warningId);
                            }
                        }, 10000);
                    }, 5000);
                    
                    // Log the blacklisted word detection
                    console.log(`[BlacklistFilter] Removed message from ${message.author.tag} containing prohibited words: ${blacklistCheck.words.join(', ')}`);
                    
                    // Check if we should auto-mute
                    if (violation.count >= VIOLATION_THRESHOLD) {
                        await this.autoMuteUser(message, violation.count);
                    }
                    
                    return;
                } catch (deleteError) {
                    // Only log if it's not an Unknown Message error (already deleted)
                    if (deleteError.code !== 10008) {
                        console.error('Error deleting message with blacklisted word:', deleteError);
                    }
                }
            }

            // Check for links
            if (this.containsLink(message.content)) {
                // Check for staff bypass
                const staffRoles = ['Admins', 'Moderators', 'Helpers', 'Senior Moderators', 'T', 'Trial Helpers', 'TraniumBot'];
                const hasStaffRole = message.member.roles.cache.some(role => 
                    staffRoles.includes(role.name));
                
                if (hasStaffRole) {
                    console.log(`[Link Debug] ${message.author.tag} has staff role, allowing Link`);
                    return;
                }
                
                // Check if this is a Discord message link from the same server
                if (this.isAllowedDiscordLink(message.content, message.guild.id)) {
                    console.log(`[Link Debug] Allowing Discord message link from same server for ${message.author.tag}`);
                    return;
                }

                // Ignore Tenor links for Level 25+ users in general, they're handled by GIF permissions
                if (message.content.includes('tenor.com/view')) {
                    // First check: No GIFs role always takes precedence
                    const NO_GIFS_ROLE_ID = '1370134955832770580';
                    if (message.member.roles.cache.has(NO_GIFS_ROLE_ID)) {
                        console.log(`[Link Debug] User ${message.author.tag} has No GIFs role and tried to post Tenor link`);
                        await message.delete();
                        const warningMessage = await message.channel.send({
                            content: `${message.author}, you don't have permission to send GIFs.`
                        });
                        
                        // Delete warning after 5 seconds
                        setTimeout(() => {
                            warningMessage.delete().catch(() => {});
                        }, 5000);
                        return;
                    }
                
                    const channelName = message.channel.name.toLowerCase();
                    const LEVEL_25_ROLE_ID = '1066909500210151555';
                    const hasLevel25 = message.member.roles.cache.has(LEVEL_25_ROLE_ID);
                    
                    // Match both possible general chat formats
                    const isGeneralChat = channelName === '💬」general' || channelName === '💬」general-chat';
                    
                    if (isGeneralChat && hasLevel25) {
                        console.log(`[Link Debug] Skipping link filter for tenor link from Level 25 user ${message.author.tag} in general`);
                        return;
                    }
                }
                
                // Special handling for music channel
                const musicChannelId = channelConfig.getId('MUSIC');
                if (message.channel.id === musicChannelId && 
                    ALLOWED_MUSIC_LINKS.some(link => message.content.includes(link))) {
                    // Allow music links in music channel
                    return;
                }

                // Allow links in general for Level 25+ users
                const channelName = message.channel.name.toLowerCase();
                // Use exact role ID instead of name to be consistent with GIF permissions
                const LEVEL_25_ROLE_ID = '1066909500210151555';
                const hasLevel25 = message.member.roles.cache.has(LEVEL_25_ROLE_ID);
                
                // Match both possible general chat formats: '💬」general' or '💬」general-chat'
                const isGeneralChat = channelName === '💬」general' || channelName === '💬」general-chat';
                
                // Debug logging
                console.log(`[Link Debug] User ${message.author.tag} posted link content: ${message.content.substring(0, 100)}`);
                console.log(`[Link Debug] User roles: ${message.member.roles.cache.map(r => r.name).join(', ')}`);
                console.log(`[Link Debug] Level 25 role check for ${message.author.tag}: ${hasLevel25}, Channel: ${channelName}`);
                
                if (isGeneralChat && hasLevel25) {
                    // Allow level 25+ users to post links in general
                    console.log(`[Link Debug] Allowing link for ${message.author.tag} with Level 25 role`);
                    return;
                }

                // For all other cases, delete the message with the link
                try {
                    await message.delete();
                    const warningMessage = await message.channel.send({
                        content: `${message.author}, posting links is not allowed in this channel.`
                    });
                    
                    // Delete warning after 5 seconds
                    setTimeout(() => {
                        warningMessage.delete().catch(() => {});
                    }, 5000);
                } catch (deleteError) {
                    // Only log if it's not an Unknown Message error (already deleted)
                    if (deleteError.code !== 10008) {
                        console.error('Error deleting message with link:', deleteError);
                    }
                }
                return;
            }

        } catch (error) {
            console.error('Error filtering message:', error);
            try {
                // Only send error message if we can
                if (message.channel && message.channel.send) {
                    const errorMessage = await message.channel.send({
                        content: `An error occurred while filtering message. The error has been logged.`
                    });
                    
                    // Delete error message after 5 seconds
                    setTimeout(() => {
                        errorMessage.delete().catch(() => {});
                    }, 5000);
                }
            } catch (msgError) {
                console.error('Failed to send error message:', msgError);
            }
        }
    }
}

module.exports = new MessageFilters(); 
