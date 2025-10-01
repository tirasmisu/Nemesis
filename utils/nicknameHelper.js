const fs = require('fs/promises');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const COOLDOWN_TIME = 1 * 60 * 1000; // 1 minute in milliseconds
const NICKNAME_REQUEST_TRACKING_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds
const OLD_REQUEST_CLEANUP_TIME = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const nicknameCooldownFile = path.join(__dirname, '../data/nicknameCooldowns.json');

async function ensureFileExists() {
    try {
        await fs.access(nicknameCooldownFile);
    } catch {
        await fs.writeFile(nicknameCooldownFile, JSON.stringify([]));
    }
}

async function readNicknameCooldowns() {
    await ensureFileExists();
    try {
        const content = await fs.readFile(nicknameCooldownFile, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error('Error reading nickname cooldown file:', error);
        return [];
    }
}

async function writeNicknameCooldowns(cooldowns) {
    try {
        await fs.writeFile(nicknameCooldownFile, JSON.stringify(cooldowns, null, 2));
    } catch (error) {
        console.error('Error writing nickname cooldown file:', error);
        throw error;
    }
}

async function updateNicknameCooldown(userId) {
    const cooldowns = await readNicknameCooldowns();
    const now = Date.now();
    
    const existingIndex = cooldowns.findIndex(entry => entry.userId === userId);
    if (existingIndex !== -1) {
        cooldowns[existingIndex].lastRequest = now;
    } else {
        cooldowns.push({ userId, lastRequest: now });
    }
    
    await writeNicknameCooldowns(cooldowns);
}

async function clearNicknameCooldown(userId) {
    const cooldowns = await readNicknameCooldowns();
    const filteredCooldowns = cooldowns.filter(entry => entry.userId !== userId);
    await writeNicknameCooldowns(filteredCooldowns);
    console.log(`[NicknameCooldown] Cleared cooldown for user ${userId}`);
}

async function trackNicknameRequest(userId) {
    const cooldowns = await readNicknameCooldowns();
    const now = Date.now();
    
    const existingIndex = cooldowns.findIndex(entry => entry.userId === userId);
    if (existingIndex !== -1) {
        cooldowns[existingIndex].lastRequest = now;
        cooldowns[existingIndex].recentActivity = now;
    } else {
        cooldowns.push({ userId, lastRequest: now, recentActivity: now });
    }
    
    await writeNicknameCooldowns(cooldowns);
    console.log(`[NicknameCooldown] Tracked nickname request activity for user ${userId}`);
}

async function isRecentNicknameRequest(userId) {
    const cooldowns = await readNicknameCooldowns();
    const userEntry = cooldowns.find(entry => entry.userId === userId);
    
    if (userEntry && userEntry.recentActivity) {
        const timeElapsed = Date.now() - userEntry.recentActivity;
        return timeElapsed < NICKNAME_REQUEST_TRACKING_TIME;
    }
    
    return false;
}

async function hasPendingNicknameRequest(userId, guild) {
    try {
        const channelConfig = require('../config/channels');
        const nicknameRequestChannelId = channelConfig.getId('NICKNAME_REQUESTS');
        const nicknameRequestChannel = guild.channels.cache.get(nicknameRequestChannelId);
        
        if (!nicknameRequestChannel) {
            return false;
        }
        
        // Check for existing pending requests (look for requests without status field)
        const recentMessages = await nicknameRequestChannel.messages.fetch({ limit: 100 });
        const userPendingRequest = recentMessages.find(msg => 
            msg.embeds[0]?.description?.includes(`<@${userId}>`) &&
            !msg.embeds[0]?.fields?.some(field => field.name === "Accepted by" || field.name === "Rejected by")
        );
        
        return !!userPendingRequest;
    } catch (error) {
        console.error('Error checking for pending nickname requests:', error);
        return false;
    }
}

async function shouldSkipOOOProcessing(userId, guild) {
    // Check for recent activity (5 minutes)
    const recentActivity = await isRecentNicknameRequest(userId);
    if (recentActivity) {
        return true;
    }
    
    // Check for pending requests (until resolved)
    const pendingRequest = await hasPendingNicknameRequest(userId, guild);
    if (pendingRequest) {
        return true;
    }
    
    return false;
}

async function cleanupOldPendingRequests(guild) {
    try {
        const channelConfig = require('../config/channels');
        const nicknameRequestChannelId = channelConfig.getId('NICKNAME_REQUESTS');
        const nicknameRequestChannel = guild.channels.cache.get(nicknameRequestChannelId);
        
        if (!nicknameRequestChannel) {
            return;
        }
        
        const messages = await nicknameRequestChannel.messages.fetch({ limit: 100 });
        const now = Date.now();
        let cleanedCount = 0;
        
        for (const [messageId, message] of messages) {
            // Check if it's a pending request (has embed but no resolution fields)
            if (message.embeds[0] && 
                !message.embeds[0].fields?.some(field => field.name === "Accepted by" || field.name === "Rejected by")) {
                
                const messageAge = now - message.createdTimestamp;
                if (messageAge > OLD_REQUEST_CLEANUP_TIME) {
                    // Mark as expired
                    const expiredEmbed = new EmbedBuilder()
                        .setColor(0x808080)
                        .setTitle('Nickname Change Request')
                        .setDescription(message.embeds[0].description)
                        .setThumbnail(message.embeds[0].thumbnail?.url || null)
                        .addFields(
                            { name: 'Expired', value: 'Request expired after 7 days' }
                        )
                        .setTimestamp();
                    
                    await message.edit({ embeds: [expiredEmbed], components: [] });
                    cleanedCount++;
                }
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`[NicknameCleanup] Cleaned up ${cleanedCount} expired nickname requests`);
        }
    } catch (error) {
        console.error('Error cleaning up old pending requests:', error);
    }
}

async function canRequestNickname(userId, guild = null) {
    // First check if user has a pending request
    if (guild) {
        const hasPending = await hasPendingNicknameRequest(userId, guild);
        if (hasPending) {
            return {
                allowed: false,
                type: 'pending',
                message: 'You already have a pending nickname request. Please wait for staff to review it before submitting a new one.'
            };
        }
    }
    
    // Then check cooldown
    const cooldowns = await readNicknameCooldowns();
    const userEntry = cooldowns.find(entry => entry.userId === userId);
    
    if (userEntry) {
        const timeRemaining = userEntry.lastRequest + COOLDOWN_TIME - Date.now();
        if (timeRemaining > 0) {
            const secondsRemaining = Math.ceil(timeRemaining / 1000);
            return {
                allowed: false,
                type: 'cooldown',
                remaining: secondsRemaining,
                message: `You must wait ${secondsRemaining} seconds before requesting another nickname change.`
            };
        }
    }
    return { allowed: true };
}

module.exports = {
    readNicknameCooldowns,
    writeNicknameCooldowns,
    updateNicknameCooldown,
    clearNicknameCooldown,
    canRequestNickname,
    trackNicknameRequest,
    isRecentNicknameRequest,
    hasPendingNicknameRequest,
    shouldSkipOOOProcessing,
    cleanupOldPendingRequests
};
