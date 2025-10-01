const { EmbedBuilder } = require('discord.js');
const fs = require('fs/promises');
const path = require('path');
const { getModerationLogChannel } = require('./commandHelpers');
const channelConfig = require('../config/channels');

// Global client reference (will be set by main index.js)
let discordClient = null;

// Function to set the Discord client for error logging
function setDiscordClient(client) {
    discordClient = client;
}

// Error severity levels
const ERROR_SEVERITY = {
    CRITICAL: 'critical',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    INFO: 'info'
};

// Error categories
const ERROR_CATEGORY = {
    COMMAND: 'command',
    PERMISSION: 'permission',
    DATABASE: 'database',
    NETWORK: 'network',
    SYSTEM: 'system',
    VALIDATION: 'validation',
    INTERACTION: 'interaction'
};

// Command error types
const ERROR_TYPES = {
    PERMISSION: 'PERMISSION_DENIED',
    VALIDATION: 'VALIDATION_ERROR',
    EXECUTION: 'EXECUTION_ERROR',
    NETWORK: 'NETWORK_ERROR',
    DATABASE: 'DATABASE_ERROR',
    SYSTEM: 'SYSTEM_ERROR'
};

// Error statistics
let errorStats = {
    total: 0,
    bySeverity: {},
    byCategory: {},
    byCommand: {},
    recentErrors: [],
    recoveryAttempts: 0,
    successfulRecoveries: 0
};

// Initialize error logger
async function initializeErrorLogger() {
    const logDir = path.join(__dirname, '../logs');
    const statsPath = path.join(logDir, 'error_stats.json');
    try {
        await fs.mkdir(logDir, { recursive: true });
        try {
            const stats = await fs.readFile(statsPath, 'utf8');
            errorStats = { ...errorStats, ...JSON.parse(stats) };
        } catch {
            await fs.writeFile(statsPath, JSON.stringify(errorStats, null, 2));
        }
    } catch (err) {
        console.error('Failed to initialize error logger:', err);
    }
}

// Generate unique error ID
function generateErrorId() {
    return `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Update error statistics
function updateErrorStats(entry) {
    errorStats.total++;
    errorStats.bySeverity[entry.severity] = (errorStats.bySeverity[entry.severity] || 0) + 1;
    errorStats.byCategory[entry.category] = (errorStats.byCategory[entry.category] || 0) + 1;
    if (entry.command) {
        errorStats.byCommand[entry.command] = (errorStats.byCommand[entry.command] || 0) + 1;
    }
    errorStats.recentErrors.unshift(entry);
    if (errorStats.recentErrors.length > 100) errorStats.recentErrors.pop();
    saveErrorStats();
}

// Save error to file
async function saveErrorToFile(entry) {
    const logPath = path.join(__dirname, '../logs', `errors-${new Date().toISOString().split('T')[0]}.log`);
    await fs.appendFile(logPath, JSON.stringify(entry) + '\n');
}

// Save error statistics
async function saveErrorStats() {
    const statsPath = path.join(__dirname, '../logs', 'error_stats.json');
    const historicalStatsPath = path.join(__dirname, '../logs', 'error_stats_history.jsonl');
    
    // Create a timestamped entry for historical tracking
    const timestampedStats = {
        timestamp: new Date().toISOString(),
        ...errorStats
    };
    
    // Append to historical log (JSONL format - one JSON object per line)
    await fs.appendFile(historicalStatsPath, JSON.stringify(timestampedStats) + '\n');
    
    // Keep the current stats file for immediate access (overwrite is intentional here)
    await fs.writeFile(statsPath, JSON.stringify(errorStats, null, 2));
}

// Recovery handlers (stubs)
async function handleDatabaseRecovery() {
    // Implement database reconnection logic
}
async function handleNetworkRecovery() {
    // Implement network retry logic
}
async function handleSystemRecovery() {
    // Implement system cleanup logic
}

// Attempt error recovery
async function attemptErrorRecovery(entry) {
    errorStats.recoveryAttempts++;
    try {
        switch (entry.category) {
            case ERROR_CATEGORY.DATABASE:
                await handleDatabaseRecovery(); break;
            case ERROR_CATEGORY.NETWORK:
                await handleNetworkRecovery(); break;
            case ERROR_CATEGORY.SYSTEM:
                await handleSystemRecovery(); break;
            default:
                return false;
        }
        errorStats.successfulRecoveries++;
        return true;
    } catch (_) {
        return false;
    }
}

// Create error report embed
function createErrorReportEmbed(entry) {
    const colors = {
        [ERROR_SEVERITY.CRITICAL]: 0xFF0000,
        [ERROR_SEVERITY.HIGH]: 0xFF3300,
        [ERROR_SEVERITY.MEDIUM]: 0xFF6600,
        [ERROR_SEVERITY.LOW]: 0xFF9900,
        [ERROR_SEVERITY.INFO]: 0x0099FF
    };
    
    const safeStack = entry.error.stack ? entry.error.stack.slice(0, 1000) + '...' : 'No stack trace available';
    
    return new EmbedBuilder()
        .setColor(colors[entry.severity])
        .setTitle(`Error Report - ${entry.severity.toUpperCase()}`)
        .setDescription(`### **${entry.error.name}**`)
        .addFields(
            { name: "Error ID", value: entry.id, inline: true },
            { name: "Category", value: entry.category, inline: true },
            { name: "Context", value: entry.context, inline: true },
            { name: "Message", value: entry.error.message, inline: false },
            { name: "Stack Trace", value: `\`\`\`${safeStack}\`\`\``, inline: false }
        )
        .setTimestamp(new Date(entry.timestamp));
}

// Log an error with details
async function logError(error, context, options = {}) {
    const {
        severity = ERROR_SEVERITY.MEDIUM,
        category = ERROR_CATEGORY.SYSTEM,
        command = null,
        guildId = null,
        userId = null,
        channelId = null,
        attemptRecovery = false
    } = options;

    const timestamp = new Date().toISOString();
    const id = generateErrorId();
    const entry = { id, timestamp, severity, category, command, context, error: { name: error.name, message: error.message, stack: error.stack }, metadata: { guildId, userId, channelId } };
    updateErrorStats(entry);
    await saveErrorToFile(entry);
    
    // Send error to Discord channel
    await sendErrorToDiscord(entry);
    
    if (attemptRecovery) await attemptErrorRecovery(entry);
    const embed = createErrorReportEmbed(entry);
    return { errorEntry: entry, embed };
}

// Get current error statistics
function getErrorStats() {
    return {
        ...errorStats,
        recoveryRate: errorStats.recoveryAttempts > 0 ? (errorStats.successfulRecoveries / errorStats.recoveryAttempts) * 100 : 0
    };
}

// Custom error class for commands
class CommandError extends Error {
    constructor(message, type = ERROR_TYPES.EXECUTION, details = {}) {
        super(message);
        this.name = 'CommandError';
        this.type = type;
        this.details = details;
    }
}

// Standardized command error handler
async function handleCommandError(interaction, error, context) {
    // Special handling for known Discord API errors
    if (error.code === 40060) {
        // Interaction already acknowledged - log but don't try to reply
        console.log(`Interaction already acknowledged in ${context} (command: ${interaction?.commandName})`);
        return;
    }
    
    // Known user errors that should not be logged as actual errors
    const knownUserErrors = [
        'You cannot add roles to someone with higher or equal hierarchy',
        'You do not have permission to use this command',
        'User is required',
        'Target is higher than you in the role hierarchy'
    ];
    
    // Check if this is a known user error that shouldn't be treated as a system error
    const isKnownUserError = error.message && knownUserErrors.some(msg => error.message.includes(msg));
    
    if (isKnownUserError) {
        // Handle known user errors without full error logging
        console.log(`[USER ERROR] ${interaction?.user?.tag || 'Unknown user'} - ${error.message} (${interaction?.commandName || 'unknown command'})`);
        
        try {
            // Only reply if interaction exists and hasn't been acknowledged
            if (interaction) {
                const userMsg = { content: error.message, flags: ['Ephemeral'] };
                
                if (interaction.replied) {
                    await interaction.followUp(userMsg).catch(() => {});
                } else if (interaction.deferred) {
                    await interaction.editReply(userMsg).catch(() => {});
                } else {
                    await interaction.reply(userMsg).catch(() => {});
                }
            }
        } catch (replyError) {
            console.log(`Could not reply with known error message: ${replyError.message}`);
        }
        
        return;
    }
    
    // Only log actual errors (not user errors)
    const { errorEntry, embed } = await logError(error, context, {
        severity: error instanceof CommandError ? ERROR_SEVERITY.MEDIUM : ERROR_SEVERITY.HIGH,
        category: ERROR_CATEGORY.COMMAND,
        command: interaction?.commandName,
        guildId: interaction?.guild?.id,
        userId: interaction?.user?.id,
        channelId: interaction?.channelId
    });

    if (interaction?.guild) {
        const logChannel = getModerationLogChannel(interaction.guild);
        if (logChannel) {
            try { await logChannel.send({ embeds: [embed] }); } catch {};
        }
    }

    const userMsg = { 
        content: error instanceof CommandError ? error.message : `An error occurred while ${context.toLowerCase()}. The error has been logged.`, 
        flags: ['Ephemeral'] 
    };
    
    try {
        // Only try to reply if interaction exists and hasn't been acknowledged in a way that would cause an error
        if (interaction) {
            if (interaction.replied) {
                // If already replied, use followUp
                await interaction.followUp(userMsg).catch(e => console.log(`Could not follow up with error message: ${e.message}`));
            } else if (interaction.deferred) {
                // If deferred but not replied, use editReply
                await interaction.editReply(userMsg).catch(e => console.log(`Could not edit reply with error message: ${e.message}`));
            } else {
                // If not replied or deferred, use regular reply
                await interaction.reply(userMsg).catch(e => console.log(`Could not reply with error message: ${e.message}`));
            }
        }
    } catch (replyError) {
        console.log(`Failed to send error message to user: ${replyError.message}`);
    }
    
    return errorEntry;
}

// Send an error message to a user with proper handling
function sendErrorMessage(interaction, message) {
    if (!interaction) return;
    
    try {
        const errorMessage = { 
            content: message,
            flags: ['Ephemeral'] 
        };
        
        if (interaction.replied) {
            return interaction.followUp(errorMessage).catch(e => 
                console.log(`Could not follow up with error message: ${e.message}`)
            );
        } else if (interaction.deferred) {
            return interaction.editReply(errorMessage).catch(e => 
                console.log(`Could not edit reply with error message: ${e.message}`)
            );
        } else {
            return interaction.reply(errorMessage).catch(e => 
                console.log(`Could not reply with error message: ${e.message}`)
            );
        }
    } catch (error) {
        console.error('Error sending error message to user:', error);
    }
}

// Send error to Discord channel
async function sendErrorToDiscord(errorEntry) {
    try {
        if (!discordClient) {
            console.log('[ERROR_MANAGER] Discord client not available for error logging');
            return;
        }

        const errorChannelId = channelConfig.getId('BOT_ERROR_LOG');
        const errorChannel = await discordClient.channels.fetch(errorChannelId);
        
        if (!errorChannel) {
            console.log('[ERROR_MANAGER] Bot error log channel not found');
            return;
        }

        const embed = createErrorReportEmbed(errorEntry);
        await errorChannel.send({ embeds: [embed] });
        
    } catch (error) {
        console.error('[ERROR_MANAGER] Failed to send error to Discord:', error);
    }
}

// Helpers for creating specific errors
function createPermissionError(message, details = {}) { return new CommandError(message, ERROR_TYPES.PERMISSION, details); }
function createValidationError(message, details = {}) { return new CommandError(message, ERROR_TYPES.VALIDATION, details); }
function createDatabaseError(message, details = {}) { return new CommandError(message, ERROR_TYPES.DATABASE, details); }

module.exports = {
    ERROR_SEVERITY,
    ERROR_CATEGORY,
    ERROR_TYPES,
    initializeErrorLogger,
    logError,
    getErrorStats,
    createErrorReportEmbed,
    CommandError,
    handleCommandError,
    createPermissionError,
    createValidationError,
    createDatabaseError,
    sendErrorMessage,
    sendErrorToDiscord,
    setDiscordClient
}; 
