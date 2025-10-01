const UserXP = require('../models/UserXP');
const { EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

// Constants for XP calculations
const MESSAGE_XP = {
    MIN: 15,
    MAX: 25
};

const VOICE_XP = {
    PER_MINUTE: 10, // Updated from 20 to 10 XP per minute to be more slower than chat XP
    CHECK_INTERVAL: 60000, // Check every minute (in ms)
    MIN_USERS: 2, // Minimum number of users in a voice channel to earn XP
    AFK_CHANNEL_ID: '1040798264737402920' // AFK channel ID - users in this channel won't earn XP
};

// Cooldown for message XP (to prevent spam)
const MESSAGE_COOLDOWN = 60000; // 1 minute cooldown between XP for messages
const activeVoiceUsers = new Map(); // Track users in voice channels

// Cache to store last message timestamps to prevent XP farming
const userMessageCooldowns = new Map();

// Level role configuration
const LEVEL_ROLES = {
    5: '1066909132243865660',   // Level 5 role
    10: '1066909130964611123',  // Level 10 role
    15: '1066909129941192705',  // Level 15 role
    25: '1066909500210151555'   // Level 25 role
};

/**
 * Award XP to a user for sending a message
 * @param {string} userId - The Discord user ID
 * @param {string} guildId - The Discord guild ID
 * @param {object} message - The Discord message object
 * @returns {Promise<{xpAwarded: number, totalXp: number, level: number, leveledUp: boolean}>}
 */
async function awardMessageXP(userId, guildId, message) {
    try {
        // Skip if message is too short (prevent XP farming with single characters)
        if (message.content && message.content.length < 3) {
            return { xpAwarded: 0, totalXp: 0, level: 0, leveledUp: false };
        }

        // Get current timestamp
        const now = Date.now();
        
        // Check user cooldown
        const userCooldownKey = `${userId}-${guildId}`;
        const lastMessageTime = userMessageCooldowns.get(userCooldownKey) || 0;
        
        // If user is on cooldown, don't award XP
        if (now - lastMessageTime < MESSAGE_COOLDOWN) {
            return { xpAwarded: 0, totalXp: 0, level: 0, leveledUp: false };
        }
        
        // Update cooldown timestamp
        userMessageCooldowns.set(userCooldownKey, now);
        
        // Find or create user XP record
        const userXP = await UserXP.findOrCreate(userId, guildId);
        
        // Generate random XP amount
        const xpToAdd = Math.floor(Math.random() * (MESSAGE_XP.MAX - MESSAGE_XP.MIN + 1)) + MESSAGE_XP.MIN;
        
        // Record old level for comparison
        const oldLevel = userXP.level;
        
        // Update user XP
        userXP.xp += xpToAdd;
        userXP.messageCount += 1;
        userXP.lastMessageTimestamp = new Date();
        
        // Save changes and update level
        const levelInfo = userXP.updateLevel();
        await userXP.save();
        
        return {
            xpAwarded: xpToAdd,
            totalXp: userXP.xp,
            level: userXP.level,
            leveledUp: levelInfo.hasLeveledUp
        };
    } catch (error) {
        console.error('[XP Service] Error awarding message XP:', error);
        return { xpAwarded: 0, totalXp: 0, level: 0, leveledUp: false };
    }
}

/**
 * Handle a user joining a voice channel
 * @param {string} userId - The Discord user ID
 * @param {string} guildId - The Discord guild ID 
 * @param {string} channelId - The voice channel ID
 */
async function handleVoiceJoin(userId, guildId, channelId) {
    try {
        // Skip AFK channel
        if (channelId === VOICE_XP.AFK_CHANNEL_ID) {
            console.log(`[XP] User ${userId} joined AFK channel - not tracking for XP`);
            return;
        }
        
        const userXP = await UserXP.findOrCreate(userId, guildId);
        
        // Update user's voice status
        userXP.voiceChannelId = channelId;
        userXP.voiceJoinedAt = new Date();
        await userXP.save();
        
        // Add user to active voice users map
        const key = `${userId}-${guildId}`;
        activeVoiceUsers.set(key, {
            userId,
            guildId,
            channelId,
            joinedAt: new Date(),
            lastUpdateAt: new Date()
        });
        
        console.log(`[XP] User ${userId} joined voice channel ${channelId} in guild ${guildId}`);
    } catch (error) {
        console.error('[XP Service] Error handling voice join:', error);
    }
}

/**
 * Handle a user leaving a voice channel
 * @param {string} userId - The Discord user ID
 * @param {string} guildId - The Discord guild ID
 * @param {object} client - Discord client for fetching data
 */
async function handleVoiceLeave(userId, guildId, client) {
    try {
        const key = `${userId}-${guildId}`;
        const voiceData = activeVoiceUsers.get(key);
        
        if (!voiceData) return;
        
        // Remove user from active voice users
        activeVoiceUsers.delete(key);
        
        // Get user XP record
        const userXP = await UserXP.findOne({ userId, guildId });
        if (!userXP || !userXP.voiceJoinedAt) return;
        
        // Calculate time spent in voice
        const joinedAt = userXP.voiceJoinedAt;
        const now = new Date();
        const minutesInVoice = Math.floor((now - joinedAt) / 60000);
        
        if (minutesInVoice <= 0) return;
        
        // Calculate XP to award
        const xpToAdd = minutesInVoice * VOICE_XP.PER_MINUTE;
        
        // Update user XP
        userXP.xp += xpToAdd;
        userXP.voiceTimeMinutes += minutesInVoice;
        userXP.lastVoiceTimestamp = now;
        userXP.voiceChannelId = null;
        userXP.voiceJoinedAt = null;
        
        // Save changes and update level
        const levelInfo = userXP.updateLevel();
        await userXP.save();
        
        console.log(`[XP] User ${userId} left voice after ${minutesInVoice} minutes and earned ${xpToAdd} XP`);
        
        // Notify user if they leveled up
        if (levelInfo.hasLeveledUp) {
            try {
                await sendLevelUpNotification(userId, guildId, levelInfo.newLevel, client);
            } catch (notifyError) {
                console.error('[XP Service] Error sending level up notification:', notifyError);
            }
        }
    } catch (error) {
        console.error('[XP Service] Error handling voice leave:', error);
    }
}

/**
 * Get user rank information
 * @param {string} userId - The Discord user ID
 * @param {string} guildId - The Discord guild ID
 */
async function getUserRank(userId, guildId) {
    try {
        // Get user XP record
        const userXP = await UserXP.findOne({ userId, guildId });
        
        if (!userXP) {
            return {
                xp: 0,
                level: 0,
                rank: 0,
                totalUsers: 0
            };
        }
        
        // Count users with more XP (to determine rank)
        const higherRanked = await UserXP.countDocuments({
            guildId,
            xp: { $gt: userXP.xp }
        });
        
        // Get total users in guild
        const totalUsers = await UserXP.countDocuments({ guildId });
        
        // Calculate XP needed for next level
        const currentLevelXP = Math.pow(userXP.level / 0.1, 2);
        const nextLevelXP = Math.pow((userXP.level + 1) / 0.1, 2);
        const xpForNextLevel = nextLevelXP - currentLevelXP;
        const xpInCurrentLevel = userXP.xp - currentLevelXP;
        const progress = xpInCurrentLevel / xpForNextLevel;
        
        return {
            xp: userXP.xp,
            level: userXP.level,
            rank: higherRanked + 1,
            totalUsers,
            messageCount: userXP.messageCount,
            voiceTimeMinutes: userXP.voiceTimeMinutes,
            progress,
            xpForNextLevel
        };
    } catch (error) {
        console.error('[XP Service] Error getting user rank:', error);
        return null;
    }
}

/**
 * Get leaderboard for a guild
 * @param {string} guildId - The Discord guild ID
 * @param {number} limit - Number of users to include
 */
async function getLeaderboard(guildId, limit = 10) {
    try {
        const leaderboard = await UserXP.find({ guildId })
            .sort({ xp: -1 })
            .limit(limit);
        
        return leaderboard;
    } catch (error) {
        console.error('[XP Service] Error getting leaderboard:', error);
        return [];
    }
}

/**
 * Send level up notification to user
 * @param {string} userId - Discord user ID
 * @param {string} guildId - Discord guild ID
 * @param {number} newLevel - The new level achieved
 * @param {object} client - Discord client
 */
async function sendLevelUpNotification(userId, guildId, newLevel, client) {
    try {
        // Get the guild
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;
        
        // Get the member
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return;

        // Check if the user should get a role
        await assignLevelRoles(member, newLevel);
        
        // Create an embed for the level up message
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('Level Up! 🎉')
            .setDescription(`Congratulations ${member.toString()}! You've reached level **${newLevel}**!`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();
        
        // Add role information if applicable
        const roleId = LEVEL_ROLES[newLevel];
        if (roleId) {
            const role = guild.roles.cache.get(roleId);
            if (role) {
                embed.addFields({
                    name: 'New Role Unlocked!',
                    value: `You've unlocked the ${role.name} role!`
                });
            }
        }
        
        // Send to the designated bot-commands channel using config
        const channelConfig = require('../config/channels');
        const botCommandsChannelId = channelConfig.getId('BOT_COMMANDS');
        const channel = guild.channels.cache.get(botCommandsChannelId);
        
        if (channel) {
            await channel.send({ embeds: [embed] });
            return;
        }
        
        // If the designated channel is not found, log an error but don't fallback to DMs
        console.error(`[XP] Bot commands channel (${botCommandsChannelId}) not found for level up notification`);
    } catch (error) {
        console.error('[XP Service] Error sending level up notification:', error);
    }
}

/**
 * Assign level roles to a member based on their current level
 * @param {GuildMember} member - Discord guild member
 * @param {number} currentLevel - The member's current level
 */
async function assignLevelRoles(member, currentLevel) {
    try {
        if (!member || !member.guild) {
            console.error('[XP] Invalid member object passed to assignLevelRoles');
            return;
        }

        // Define level roles directly
        const LEVEL_ROLES = {
            5: '1066909132243865660',   // Level 5 role
            10: '1066909130964611123',  // Level 10 role
            15: '1066909129941192705',  // Level 15 role
            25: '1066909500210151555'   // Level 25 role
        };

        // Get roles for the current level and above that the user should have
        const rolesToHave = [];
        // Get all level role IDs for role removal check
        const allLevelRoleIds = Object.values(LEVEL_ROLES);
        
        // Find all roles the user qualifies for based on their level
        for (const [level, roleId] of Object.entries(LEVEL_ROLES)) {
            if (currentLevel >= parseInt(level)) {
                // Force fetch the role instead of using cache
                try {
                    const role = await member.guild.roles.fetch(roleId);
                    if (role) {
                        rolesToHave.push(roleId);
                    } else {
                        console.error(`[XP] Level ${level} role with ID ${roleId} not found in server`);
                    }
                } catch (fetchError) {
                    console.error(`[XP] Error fetching role ${roleId}: ${fetchError.message}`);
                }
            }
        }
        
        // Check which roles the member already has
        const memberRoleIds = member.roles.cache.map(role => role.id);
        
        // Determine which roles to add
        const rolesToAdd = rolesToHave.filter(roleId => !memberRoleIds.includes(roleId));
        
        // Determine which level roles to remove (level roles they have but shouldn't)
        const rolesToRemove = memberRoleIds
            .filter(roleId => allLevelRoleIds.includes(roleId)) // Only consider level roles
            .filter(roleId => !rolesToHave.includes(roleId));   // Keep only those they shouldn't have
        
        let changesApplied = false;
        
        // Add roles if needed
        if (rolesToAdd.length > 0) {
            console.log(`[XP] Adding level roles to ${member.user.tag}: ${rolesToAdd.length} roles`);
            
            for (const roleId of rolesToAdd) {
                try {
                    await member.roles.add(roleId);
                    console.log(`[XP] Added role ${roleId} to ${member.user.tag}`);
                    changesApplied = true;
                    // Add small delay between role additions to prevent rate limiting
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (addError) {
                    if (addError.code === 50013) {
                        console.error(`[XP] Missing permissions to add role ${roleId} to ${member.user.tag}`);
                    } else {
                        console.error(`[XP] Error adding role ${roleId} to ${member.user.tag}:`, addError);
                    }
                }
            }
        }
        
        // Remove roles if needed
        if (rolesToRemove.length > 0) {
            console.log(`[XP] Removing level roles from ${member.user.tag}: ${rolesToRemove.length} roles`);
            
            for (const roleId of rolesToRemove) {
                try {
                    await member.roles.remove(roleId);
                    console.log(`[XP] Removed role ${roleId} from ${member.user.tag}`);
                    changesApplied = true;
                    // Add small delay between role removals to prevent rate limiting
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (removeError) {
                    if (removeError.code === 50013) {
                        console.error(`[XP] Missing permissions to remove role ${roleId} from ${member.user.tag}`);
                    } else {
                        console.error(`[XP] Error removing role ${roleId} from ${member.user.tag}:`, removeError);
                    }
                }
            }
        }

        if (!changesApplied) {
            console.log(`[XP] ${member.user.tag} already has the correct level roles for level ${currentLevel}`);
        }
        
        return changesApplied; // Return whether any changes were made
    } catch (error) {
        console.error('[XP Service] Error assigning level roles:', error);
        return false;
    }
}

/**
 * Import XP data from Arcane bot
 * @param {string} filePath - Path to the Arcane export JSON file
 * @param {string} guildId - The Discord guild ID to import into
 */
async function importFromArcane(filePath, guildId) {
    try {
        // Read and parse the JSON file
        const data = await fs.readFile(filePath, 'utf8');
        const arcaneData = JSON.parse(data);
        
        const importResults = {
            total: 0,
            success: 0,
            skipped: 0,
            errors: 0
        };
        
        // Process each user in the file
        for (const arcaneUser of arcaneData) {
            importResults.total++;
            
            try {
                // Validate basic structure
                if (!arcaneUser.userId || !arcaneUser.xp) {
                    importResults.skipped++;
                    continue;
                }
                
                // Find or create user record
                const userXP = await UserXP.findOne({ 
                    userId: arcaneUser.userId, 
                    guildId 
                });
                
                if (userXP) {
                    // Update existing user
                    userXP.xp = arcaneUser.xp;
                    // Let the model calculate the level based on XP
                    const levelInfo = userXP.updateLevel();
                    await userXP.save();
                } else {
                    // Create new user
                    const newUser = new UserXP({
                        userId: arcaneUser.userId,
                        guildId,
                        xp: arcaneUser.xp
                    });
                    newUser.updateLevel();
                    await newUser.save();
                }
                
                importResults.success++;
            } catch (userError) {
                console.error(`[XP Import] Error importing user ${arcaneUser.userId}:`, userError);
                importResults.errors++;
            }
        }
        
        return importResults;
    } catch (error) {
        console.error('[XP Service] Error importing from Arcane:', error);
        throw error;
    }
}

/**
 * Initialize voice XP checking interval
 * @param {object} client - Discord client
 */
function initVoiceXPSystem(client) {
    // Set up interval to process voice XP
    setInterval(async () => {
        try {
            // Process active voice users
            for (const [key, userData] of activeVoiceUsers) {
                const { userId, guildId, channelId, lastUpdateAt } = userData;
                
                // Get the guild
                const guild = client.guilds.cache.get(guildId);
                if (!guild) {
                    activeVoiceUsers.delete(key);
                    continue;
                }
                
                // Get the voice channel
                const channel = guild.channels.cache.get(channelId);
                if (!channel) {
                    activeVoiceUsers.delete(key);
                    continue;
                }
                
                // Skip AFK channel
                if (channelId === VOICE_XP.AFK_CHANNEL_ID) {
                    console.log(`[XP] Skipping XP for user ${userId} in AFK channel`);
                    continue;
                }
                
                // Check if user is still in the voice channel
                const member = await guild.members.fetch(userId).catch(() => null);
                if (!member || member.voice.channelId !== channelId) {
                    handleVoiceLeave(userId, guildId, client);
                    continue;
                }
                
                // Check number of users in channel (must be at least 2 non-bot users to earn XP)
                const nonBotMembersCount = channel.members.filter(m => !m.user.bot).size;
                if (nonBotMembersCount < VOICE_XP.MIN_USERS) {
                    // Update last check time but don't award XP
                    userData.lastUpdateAt = new Date();
                    continue;
                }
                
                // Check if user is deafened (self or server)
                if (member.voice.deaf || member.voice.selfDeaf) {
                    // Deafened users don't earn XP
                    continue;
                }
                
                // Calculate time since last update
                const now = new Date();
                const minutesSinceUpdate = (now - lastUpdateAt) / 60000;
                
                // Award XP if at least 1 minute has passed
                if (minutesSinceUpdate >= 1) {
                    // Award XP for time in voice
                    const xpToAdd = Math.floor(minutesSinceUpdate) * VOICE_XP.PER_MINUTE;
                    
                    // Get user XP record
                    const userXP = await UserXP.findOrCreate(userId, guildId);
                    
                    // Update user XP
                    userXP.xp += xpToAdd;
                    userXP.voiceTimeMinutes += Math.floor(minutesSinceUpdate);
                    userXP.lastVoiceTimestamp = now;
                    
                    // Save changes and update level
                    const levelInfo = userXP.updateLevel();
                    await userXP.save();
                    
                    // Update last update time
                    userData.lastUpdateAt = now;
                    
                    console.log(`[XP] User ${userId} earned ${xpToAdd} XP for ${Math.floor(minutesSinceUpdate)} minutes in voice`);
                    
                    // Notify user if they leveled up
                    if (levelInfo.hasLeveledUp) {
                        await sendLevelUpNotification(userId, guildId, levelInfo.newLevel, client);
                    }
                }
            }
        } catch (error) {
            console.error('[XP Service] Error processing voice XP:', error);
        }
    }, VOICE_XP.CHECK_INTERVAL);
    
    console.log('[XP] Voice XP system initialized');
}

/**
 * Get user XP data
 * @param {string} userId - The Discord user ID
 * @param {string} guildId - The Discord guild ID
 * @returns {Promise<number|null>} User's XP or null if not found
 */
async function getUserXP(userId, guildId) {
    try {
        const userXP = await UserXP.findOne({ userId, guildId });
        return userXP ? userXP.xp : null;
    } catch (error) {
        console.error('[XP Service] Error getting user XP:', error);
        return null;
    }
}

/**
 * Calculate level from XP
 * @param {number} xp - Experience points
 * @returns {number} Level
 */
function getLevelFromXP(xp) {
    return Math.floor(0.1 * Math.sqrt(xp));
}

/**
 * Get XP required for a level
 * @param {number} level - Level
 * @returns {number} XP required
 */
function getXPForLevel(level) {
    return Math.floor(Math.pow(level / 0.1, 2));
}

/**
 * Get progress percentage to next level
 * @param {number} xp - Experience points
 * @returns {number} Percentage (0-100)
 */
function getXPProgressPercent(xp) {
    const currentLevel = getLevelFromXP(xp);
    const currentLevelXP = getXPForLevel(currentLevel);
    const nextLevelXP = getXPForLevel(currentLevel + 1);
    
    const xpForNextLevel = nextLevelXP - currentLevelXP;
    const xpIntoCurrentLevel = xp - currentLevelXP;
    
    return Math.floor((xpIntoCurrentLevel / xpForNextLevel) * 100);
}

module.exports = {
    awardMessageXP,
    handleVoiceJoin,
    handleVoiceLeave,
    getUserRank,
    getLeaderboard,
    importFromArcane,
    initVoiceXPSystem,
    getUserXP,
    getLevelFromXP,
    getXPForLevel,
    getXPProgressPercent,
    sendLevelUpNotification,
    assignLevelRoles
}; 
