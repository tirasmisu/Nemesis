require('dotenv').config(); // Load environment variables
const fsPromises = require('fs/promises'); // For handling async file reading
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const logger = require('./utils/logger');
const healthMonitor = require('./utils/healthMonitor');
const memoryManager = require('./utils/memoryManager');
const networkHealth = require('./utils/networkHealth');
const analytics = require('./utils/analytics');
const cooldownManager = require('./utils/cooldownManager');
const channelManager = require('./utils/channelManager');
const dbOptimizer = require('./utils/dbOptimizer');
const database = require('./utils/database'); // Import the database module
const removeRole = require('./utils/removeRole');
const { initializeMuteManager } = require('./utils/muteManager');
const { deployCommands } = require('./utils/deployCommands');
const { initializeAutoDeployment } = require('./utils/autoDeployCommands');
// Legacy systemMonitor replaced with new logger and healthMonitor
const { handleCommandError } = require('./utils/errorManager');
const eventLoader = require('./utils/eventLoader');
const { validateConfig } = require('./utils/configValidator');
const commandManager = require('./utils/commandManager');
const { translateText } = require('./utils/translationService'); // Import the translation service
const { initVoiceXPSystem } = require('./services/xpService');
const { initializeVoiceChannelService } = require('./services/voiceChannelService');

// File path for storing nickname cooldown data
const nicknameCooldownFile = path.join(__dirname, './data/nicknameCooldowns.json');

// Global error handling with proper logging
process.on('unhandledRejection', async (reason, promise) => {
    await logger.error('PROCESS', 'Unhandled promise rejection', reason, { promise: promise.toString() });
});

process.on('uncaughtException', async (error) => {
    await logger.error('PROCESS', 'Uncaught exception', error);
    // Give time for log to write before potentially crashing
    setTimeout(() => process.exit(1), 1000);
});

// Additional error handling for Discord.js specific errors
process.on('warning', async (warning) => {
    if (warning.name === 'DeprecationWarning' || warning.name === 'ExperimentalWarning') {
        return; // Skip deprecation warnings
    }
    await logger.warn('PROCESS', 'Process warning', { warning: warning.toString() });
});

const token = process.env.TOKEN;

// Create a new Discord client instance with the necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages, // Needed to receive DMs
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [Partials.Channel], // Necessary for DM channels
    // Add timeout and retry settings
    rest: {
        timeout: 30000, // Increase timeout to 30 seconds
        retries: 3, // Retry failed requests up to 3 times
        offset: 0
    },
    ws: {
        properties: {
            browser: 'Discord iOS'
        }
    }
});

// Collections for commands and events
client.commands = new Collection();
client.guildCommands = new Collection();
client.cooldowns = new Collection();

// Add translation function to client
client.translate = translateText;

// Error handling for Discord client
client.on('error', async (error) => {
    await logger.error('DISCORD_CLIENT', 'Discord client error', error);
});

client.on('warn', async (warning) => {
    await logger.warn('DISCORD_CLIENT', 'Discord client warning', { warning });
});

// Function to restore timers from the database
async function restoreTimers() {
    try {
        const ModerationAction = require('./models/ModerationAction');
        const ms = require('ms');
        
        // Find all active role_add punishments (timed roles)
        const activeRoles = await ModerationAction.find({
            action: 'role_add',
            active: true
        });

        await logger.system('RESTORE_TIMERS', `Found ${activeRoles.length} active timed roles to process`);

        for (const punishment of activeRoles) {
            const { userId, duration, timestamp, actionId } = punishment;

            // Skip permanent roles
            if (!duration || duration === 'permanent' || duration === 'forever') {
                continue;
            }

            // Calculate when the role should expire
            const durationMs = ms(duration);
            if (!durationMs) {
                await logger.warn('RESTORE_TIMERS', `Invalid duration format: ${duration} for punishment ${actionId}`);
                continue;
            }

            const endTime = new Date(timestamp).getTime() + durationMs;
            const now = Date.now();
            const remainingTime = endTime - now;

            if (remainingTime > 0) {
                await logger.system('RESTORE_TIMERS', `Scheduled role removal`, {
                    actionId,
                    userId,
                    remainingTime: Math.round(remainingTime / 1000) + 's'
                });

                // Schedule the role removal
                setTimeout(async () => {
                    await logger.system('RESTORE_TIMERS', `Executing scheduled role removal`, { actionId, userId });
                    
                    // Get roleId from metadata to properly remove the role
                    const roleId = punishment.metadata?.roleId;
                    if (roleId) {
                        const removeRole = require('./utils/removeRole');
                        await removeRole(
                            {
                                guildId: process.env.GUILD_ID,
                                userId: userId,
                                roleId: roleId,
                                punishmentId: actionId,
                                reason: `Temporary role duration expired`
                            },
                            null,
                            client.user,
                            client
                        );
                    } else {
                        // No roleId stored, just mark as inactive
                        await ModerationAction.findOneAndUpdate(
                            { actionId: actionId },
                            { active: false }
                        );
                        console.log(`[RESTORE_TIMERS] Marked timed role punishment ${actionId} as inactive (expired, no roleId)`);
                    }
                }, remainingTime);
            } else {
                await logger.system('RESTORE_TIMERS', `Expired role removal`, { actionId, userId });

                // Get roleId from metadata to properly remove the role
                const roleId = punishment.metadata?.roleId;
                if (roleId) {
                    const removeRole = require('./utils/removeRole');
                    await removeRole(
                        {
                            guildId: process.env.GUILD_ID,
                            userId: userId,
                            roleId: roleId,
                            punishmentId: actionId,
                            reason: `Temporary role duration expired`
                        },
                        null,
                        client.user,
                        client
                    );
                } else {
                    // No roleId stored, just mark as inactive
                    await ModerationAction.findOneAndUpdate(
                        { actionId: actionId },
                        { active: false }
                    );
                }
            }
        }
    } catch (error) {
        await logger.error('RESTORE_TIMERS', 'Error occurred while restoring timers', error);
    }
}

async function restoreNicknameCooldowns() {
    try {
        // Attempt to read the file; if it doesn't exist, skip restoration.
        let data;
        try {
            data = await fsPromises.readFile(nicknameCooldownFile, 'utf8');
        } catch (err) {
            await logger.system('RESTORE_COOLDOWNS', 'No nickname cooldown file found - skipping restoration');
            return;
        }
        const cooldowns = JSON.parse(data || '[]');
        const now = Date.now();
        const cooldownTime = 30 * 60 * 1000; // 30 minutes in milliseconds

        // Filter out expired cooldown entries
        const activeCooldowns = cooldowns.filter(entry => now < entry.lastRequest + cooldownTime);

        if (activeCooldowns.length !== cooldowns.length) {
            await fsPromises.writeFile(nicknameCooldownFile, JSON.stringify(activeCooldowns, null, 4));
            await logger.system('RESTORE_COOLDOWNS', `Cleared expired nickname cooldowns - ${activeCooldowns.length} active remaining`);
        } else {
            await logger.system('RESTORE_COOLDOWNS', 'No expired nickname cooldowns found');
        }
    } catch (error) {
        await logger.error('RESTORE_COOLDOWNS', 'Error restoring nickname cooldowns', error);
    }
}

// Load commands from the commands folder
async function loadCommands() {
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);

        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            // Remove debug message - commands are now logged by logger system
        } else {
            await logger.warn('COMMAND_LOADER', `Command at ${filePath} is missing required "data" or "execute" property`);
        }
    }

    // Load guild-specific commands if needed (optional)
    const guildCommandsPath = path.join(__dirname, 'guildCommands');
    if (fs.existsSync(guildCommandsPath)) {
        const guildCommandFiles = fs.readdirSync(guildCommandsPath).filter(file => file.endsWith('.js'));

        for (const file of guildCommandFiles) {
            const filePath = path.join(guildCommandsPath, file);
            const command = require(filePath);

            if ('data' in command && 'execute' in command) {
                client.guildCommands.set(command.data.name, command);
                // Remove debug message - commands are now logged by logger system
            } else {
                await logger.warn('GUILD_COMMAND_LOADER', `Command at ${filePath} is missing required "data" or "execute" property`);
            }
        }
    }

    // Load events from the events folder
    const eventsPath = path.join(__dirname, 'events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);

        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }

        // Remove debug message - events are now logged by logger system
    }
}

// Call the async function
loadCommands().catch(console.error);

// Initialize bot
async function initializeBot() {
    try {
        // First validate config
        await validateConfig();
        
        // Connect to MongoDB - AWAIT the connection!
        await database.connect();
        
        // Give the database connection a moment to fully establish
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Load commands using commandManager (don't load manually)
        await commandManager.loadCommands(client);
        
        // Auto-deploy commands to Discord (adds new, removes old, updates changed)
        await initializeAutoDeployment(client);
        
        // Initialize mute manager (after database is fully connected)
        await initializeMuteManager(client);
        
        // Initialize system monitoring
        // Legacy monitoring system removed - replaced with new performance systems
        
        // Initialize voice XP system
        initVoiceXPSystem(client);
        
        // Initialize voice channel service for Join to Create
        await initializeVoiceChannelService(client);
        
        await logger.system('BOT', 'Bot initialization complete');
    } catch (error) {
        await logger.error('BOT_INIT', 'Error initializing bot', error);
    }
}

// Ready event
client.once('ready', async () => {
    await logger.system('BOT', `Logged in as ${client.user.tag}`);
    
    // Set Discord client for error logging
    logger.setDiscordClient(client);
    const { setDiscordClient } = require('./utils/errorManager');
    setDiscordClient(client);
    
    await initializeBot();
    
            // Initialize system monitoring after bot is ready
        healthMonitor.metrics.activeConnections = client.guilds.cache.size;
        
        // Initialize channel manager with client
        channelManager.setClient(client);
    
    // Restore timers for timed roles after login
    await restoreTimers();
    await restoreNicknameCooldowns();
    
    await logger.system('BOT', 'Timer restoration process completed');
    
    // Set up daily log rotation
    setInterval(async () => {
        await logger.rotateLogs();
    }, 24 * 60 * 60 * 1000); // Daily
    
    // Set up automatic role auditing every 6 hours
    const roleAuditor = require('./utils/roleAuditor');
    setInterval(async () => {
        try {
            await logger.system('AUTO_AUDIT', 'Running scheduled role audit');
            await roleAuditor.auditAllRoles(client, process.env.GUILD_ID);
        } catch (error) {
            await logger.error('AUTO_AUDIT', 'Error during scheduled role audit', error);
        }
    }, 6 * 60 * 60 * 1000); // Every 6 hours
    
    // Set up network health monitoring every 5 minutes
    setInterval(async () => {
        try {
            await networkHealth.checkDiscordConnectivity();
        } catch (error) {
            await logger.error('NETWORK_MONITOR', 'Error during network health check', error);
        }
    }, 5 * 60 * 1000); // Every 5 minutes
    
    await logger.system('BOT', 'Bot fully operational and ready');
});

// Error handling
client.on('error', async (error) => {
    await logger.error('CLIENT', 'Discord client error', error);
    
    // Handle connection timeout errors specifically
    if (error.code === 'UND_ERR_CONNECT_TIMEOUT' || error.message.includes('Connect Timeout')) {
        console.log('Connection timeout detected. Attempting to reconnect...');
        setTimeout(() => {
            client.login(token).catch(async (err) => {
                await logger.error('BOT', 'Failed to reconnect', err);
            });
        }, 5000); // Wait 5 seconds before reconnecting
    }
});

// Add connection event handlers
client.on('disconnect', async () => {
    await logger.warn('CLIENT', 'Bot disconnected from Discord');
});

client.on('reconnecting', async () => {
    await logger.info('CLIENT', 'Bot is reconnecting to Discord...');
});

client.on('resume', async (replayed) => {
    await logger.info('CLIENT', `Bot resumed connection. Replayed ${replayed} events.`);
});

// Message tracking for analytics
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    // Track message for analytics
    analytics.trackMessage(message.channel.id, message.author.id, message.content);
});

// Member join tracking
client.on('guildMemberAdd', async (member) => {
    analytics.trackNewMember(member.id, 'normal');
});

// Login
client.login(token).then(async () => {
    await logger.system('BOT', 'Bot successfully logged in');
}).catch(async (err) => {
    await logger.error('BOT', 'Failed to log in', err);
});
