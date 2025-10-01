const { Events, ActivityType } = require('discord.js');
const ticketPersistence = require('../utils/ticketPersistence');

// Helper function to check if bot can modify a user's nickname
function canBotManageUser(guild, member) {
    try {
        const botMember = guild.members.me;
        if (!botMember) return false;
        
        // If bot has admin permission, it can manage anyone except the server owner
        if (botMember.permissions.has('Administrator')) {
            return member.id !== guild.ownerId;
        }
        
        // Compare highest role positions
        const botHighestRole = botMember.roles.highest;
        const userHighestRole = member.roles.highest;
        
        // Bot can only manage users with lower role position
        return botHighestRole.position > userHighestRole.position && member.id !== guild.ownerId;
    } catch (error) {
        console.error('[HIERARCHY_CHECK] Error checking hierarchy:', error);
        return false;
    }
}

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`Ready! Logged in as ${client.user.tag}`);
        
        // Mute manager initialization is handled in index.js after database connection is established

        // Initialize the ticket persistence system
        try {
            await ticketPersistence.initialize(client);
            console.log('Ticket persistence initialized successfully');
        } catch (error) {
            console.error('Error initializing ticket persistence:', error);
        }
        
        // Set the bot's status message
        client.user.setPresence({
            activities: [
                {
                    name: 'DM me "-ticket" to create a ticket!',
                    type: ActivityType.Custom
                }
            ],
            status: 'online'
        });
        
        console.log('Bot status set to: "DM me \"-ticket\" to create a ticket!"');

        // Get the first guild (bot is designed for single server)
        const guild = client.guilds.cache.first();
        
        // Scan for users with Out of Office role and update nicknames if needed
        try {
            console.log(`[OOO-STARTUP] Starting OOO nickname scan...`);
            if (!guild) {
                console.error('[OOO-STARTUP] No guild available');
                return;
            }
            
            // Find the Out of Office and STAFF roles using role config
            const roleConfig = require('../config/roles');
            const outOfOfficeRole = guild.roles.cache.get(roleConfig.getId('OUT_OF_OFFICE'));
            const staffRole = guild.roles.cache.get(roleConfig.getId('STAFF'));
            
            if (!outOfOfficeRole) {
                console.error(`[OOO-STARTUP] Out of Office role not found!`);
                return;
            }
            
            if (!staffRole) {
                console.error('[OOO-STARTUP] STAFF role not found!');
                return;
            }
            
            console.log(`[OOO-STARTUP] Found OOO role (${outOfOfficeRole.id}) and STAFF role (${staffRole.id})`);
            
            // Fetch all members (need to use fetch to get complete member list)
            await guild.members.fetch();
            
            // Get members with Out of Office role
            const membersWithOOO = guild.members.cache.filter(
                member => member.roles.cache.has(outOfOfficeRole.id)
            );
            
            console.log(`[OOO-STARTUP] Found ${membersWithOOO.size} members with OOO role`);
            
            // Process each member
            for (const [memberId, member] of membersWithOOO) {
                const hasStaffRole = member.roles.cache.has(staffRole.id);
                const currentNickname = member.nickname;
                const username = member.user.username;
                const currentName = currentNickname || username;
                const hasOOOSuffix = currentName.endsWith('(OOO)');
                
                // Check if user has recent activity or pending nickname request to avoid interfering
                const { shouldSkipOOOProcessing } = require('../utils/nicknameHelper');
                const shouldSkip = await shouldSkipOOOProcessing(member.user.id, guild);
                
                if (shouldSkip) {
                    console.log(`[OOO-STARTUP] ⏭️ Skipping ${member.user.tag} - recent nickname request activity or pending request`);
                    continue;
                }
                
                console.log(`[OOO-STARTUP] Checking ${member.user.tag} - STAFF: ${hasStaffRole}, HasSuffix: ${hasOOOSuffix}, Name: "${currentName}"`);
                
                // Staff members with OOO should have (OOO) suffix
                if (hasStaffRole && !hasOOOSuffix) {
                    // Check if bot can manage this user before attempting
                    if (!canBotManageUser(guild, member)) {
                        console.log(`[OOO-STARTUP] ⏭️ Skipping ${member.user.tag} - insufficient permissions (higher role)`);
                    } else {
                        try {
                            const newNickname = `${currentName} (OOO)`;
                            console.log(`[OOO-STARTUP] Adding OOO tag to ${member.user.tag}: "${newNickname}"`);
                            await guild.members.edit(member.id, {
                                nick: newNickname
                            });
                            console.log(`[OOO-STARTUP] ✅ Successfully added (OOO) tag to ${member.user.tag}`);
                        } catch (error) {
                            console.error(`[OOO-STARTUP] Failed to update nickname for ${member.user.tag}:`, error.message);
                        }
                    }
                }
                // Non-staff with OOO tag should have it removed
                else if (!hasStaffRole && hasOOOSuffix) {
                    // Check if bot can manage this user before attempting
                    if (!canBotManageUser(guild, member)) {
                        console.log(`[OOO-STARTUP] ⏭️ Skipping ${member.user.tag} - insufficient permissions (higher role)`);
                    } else {
                        try {
                            let newNickname = currentName.replace(/ \(OOO\)$/, '');
                            // If result would be their username, clear the nickname instead
                            const finalNickname = newNickname === username ? null : newNickname;
                            console.log(`[OOO-STARTUP] Removing OOO tag from ${member.user.tag}: "${finalNickname || 'cleared'}"`);
                            await guild.members.edit(member.id, {
                                nick: finalNickname
                            });
                            console.log(`[OOO-STARTUP] ✅ Successfully removed (OOO) tag from ${member.user.tag}`);
                        } catch (error) {
                            console.error(`[OOO-STARTUP] Failed to update nickname for ${member.user.tag}:`, error.message);
                        }
                    }
                }
            }
            
            console.log(`[OOO-STARTUP] Completed OOO nickname scan`);
        } catch (error) {
            console.error('[OOO-STARTUP] Error during OOO scan:', error);
        }

        // Set up periodic cleanup of old nickname requests
        try {
            const { cleanupOldPendingRequests } = require('../utils/nicknameHelper');
            
            // Run cleanup immediately on startup
            await cleanupOldPendingRequests(guild);
            
            // Set up periodic cleanup every 6 hours
            setInterval(async () => {
                try {
                    await cleanupOldPendingRequests(guild);
                } catch (error) {
                    console.error('[NicknameCleanup] Error during scheduled cleanup:', error);
                }
            }, 6 * 60 * 60 * 1000); // 6 hours in milliseconds
            
            console.log('[NicknameCleanup] Periodic cleanup system initialized');
        } catch (error) {
            console.error('[NicknameCleanup] Error setting up cleanup system:', error);
        }

        // Sync In VC roles for all members currently in voice channels
        try {
            const roleConfig = require('../config/roles');
            
            console.log('[VoiceSync] Starting In VC role sync on startup...');
            
            const stats = {
                total: 0,
                added: 0,
                removed: 0,
                errors: 0,
                skipped: 0
            };

            // Get all members in the guild
            const members = await guild.members.fetch();
            
            for (const [memberId, member] of members) {
                // Skip bots
                if (member.user.bot) {
                    stats.skipped++;
                    continue;
                }
                
                stats.total++;
                
                try {
                    const shouldHave = member.voice.channel !== null;
                    const inVcRoleId = roleConfig.getId('IN_VC');
                    const hasRole = member.roles.cache.has(inVcRoleId);

                    if (shouldHave && !hasRole) {
                        await member.roles.add(inVcRoleId, 'User in voice channel on bot startup');
                        stats.added++;
                        console.log(`[VoiceSync] Added In VC role to ${member.user.tag}`);
                    } else if (!shouldHave && hasRole) {
                        await member.roles.remove(inVcRoleId, 'User not in voice channel on bot startup');
                        stats.removed++;
                        console.log(`[VoiceSync] Removed In VC role from ${member.user.tag}`);
                    }
                } catch (error) {
                    console.error(`[VoiceSync] Error syncing In VC role for ${member.user.tag}:`, error);
                    stats.errors++;
                }
            }

            console.log('[VoiceSync] In VC role sync completed successfully:', stats);
        } catch (error) {
            console.error('[VoiceSync] Error setting up In VC role sync:', error);
        }

        // Start the voice channel updater
        const updateVoiceChannel = async () => {
            try {
                const channel = await client.channels.fetch('1067589064666136606');
                if (!channel) {
                    console.error('Voice channel not found');
                    return;
                }

                const guild = channel.guild;
                const memberCount = guild.memberCount;
                
                // Format the member count with commas
                const formattedCount = memberCount.toLocaleString();
                
                // Update the channel name
                await channel.setName(`👤」Members: ${formattedCount}`);
                console.log(`Updated voice channel name with ${formattedCount} members`);
            } catch (error) {
                console.error('Error updating voice channel:', error);
            }
        };

        // Update immediately when the bot starts
        await updateVoiceChannel();

        // Update every 5 minutes
        setInterval(updateVoiceChannel, 5 * 60 * 1000);
    },
};
