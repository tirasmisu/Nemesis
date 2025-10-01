const fs = require('fs').promises;
const path = require('path');

// Global client reference for Discord logging
let discordClient = null;

// Function to set the Discord client for error logging
function setDiscordClient(client) {
    discordClient = client;
}

// Send error to Discord channel
async function sendErrorToDiscord(errorData) {
    try {
        if (!discordClient) {
            return; // Silently skip if client not available
        }

        const channelConfig = require('../config/channels');
        const errorChannelId = channelConfig.getId('BOT_ERROR_LOG');
        const errorChannel = await discordClient.channels.fetch(errorChannelId);
        
        if (!errorChannel) {
            return; // Silently skip if channel not found
        }

        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('🚨 Bot Error')
            .setDescription(`**Module:** ${errorData.module}\n**Message:** ${errorData.message}`)
            .addFields(
                { name: 'Error Name', value: errorData.error?.name || 'Unknown', inline: true },
                { name: 'Timestamp', value: errorData.timestamp, inline: true }
            )
            .setTimestamp();

        if (errorData.error?.stack) {
            const stackTrace = errorData.error.stack.length > 1000 
                ? errorData.error.stack.substring(0, 1000) + '...'
                : errorData.error.stack;
            embed.addFields({ name: 'Stack Trace', value: `\`\`\`${stackTrace}\`\`\``, inline: false });
        }

        if (errorData.context) {
            embed.addFields({ name: 'Context', value: JSON.stringify(errorData.context), inline: false });
        }

        await errorChannel.send({ embeds: [embed] });
        
    } catch (error) {
        console.error('[LOGGER] Failed to send error to Discord:', error);
    }
}

class Logger {
    constructor() {
        this.logDir = path.join(process.cwd(), 'logs');
        this.errorLogFile = path.join(this.logDir, 'errors.log');
        this.performanceLogFile = path.join(this.logDir, 'performance.log');
        this.commandLogFile = path.join(this.logDir, 'commands.log');
        this.moderationLogFile = path.join(this.logDir, 'moderation.log');
        this.systemLogFile = path.join(this.logDir, 'system.log');
        
        this.initializeLogs();
    }

    async initializeLogs() {
        try {
            // Create logs directory if it doesn't exist
            await fs.mkdir(this.logDir, { recursive: true });
            
            // Create log files if they don't exist
            const logFiles = [
                this.errorLogFile,
                this.performanceLogFile,
                this.commandLogFile,
                this.moderationLogFile,
                this.systemLogFile
            ];
            
            for (const file of logFiles) {
                try {
                    await fs.access(file);
                } catch {
                    await fs.writeFile(file, '');
                }
            }
            
            console.log('[LOGGER] ✅ Logging system initialized');
        } catch (error) {
            console.error('[LOGGER] ❌ Failed to initialize logging system:', error);
        }
    }

    formatLogEntry(level, module, message, data = null) {
        const timestamp = new Date().toISOString();
        const entry = {
            timestamp,
            level,
            module,
            message,
            data: data || undefined
        };
        return JSON.stringify(entry) + '\n';
    }

    async writeToFile(file, content) {
        try {
            await fs.appendFile(file, content);
        } catch (error) {
            console.error(`[LOGGER] Failed to write to ${file}:`, error);
        }
    }

    // Error logging
    async error(module, message, error = null, context = null) {
        const errorData = {
            stack: error?.stack,
            name: error?.name,
            code: error?.code,
            context
        };
        
        const logEntry = this.formatLogEntry('ERROR', module, message, errorData);
        await this.writeToFile(this.errorLogFile, logEntry);
        
        // Also log to console for immediate visibility
        console.error(`[${module}] ❌ ${message}`, error);

        // Send error to Discord
        await sendErrorToDiscord({
            module,
            message,
            error: errorData,
            timestamp: new Date().toISOString()
        });
    }

    // Performance logging
    async performance(module, operation, duration, metadata = null) {
        const perfData = {
            operation,
            duration_ms: duration,
            metadata
        };
        
        const logEntry = this.formatLogEntry('PERFORMANCE', module, `${operation} completed`, perfData);
        await this.writeToFile(this.performanceLogFile, logEntry);
    }

    // Command usage logging
    async command(userId, username, commandName, guildId, success = true, error = null) {
        const commandData = {
            userId,
            username,
            commandName,
            guildId,
            success,
            error: error?.message
        };
        
        const logEntry = this.formatLogEntry('COMMAND', 'BOT', `Command executed: ${commandName}`, commandData);
        await this.writeToFile(this.commandLogFile, logEntry);
    }

    // Moderation action logging
    async moderation(moderatorId, targetId, action, reason, metadata = null) {
        const modData = {
            moderatorId,
            targetId,
            action,
            reason,
            metadata
        };
        
        const logEntry = this.formatLogEntry('MODERATION', 'BOT', `Moderation action: ${action}`, modData);
        await this.writeToFile(this.moderationLogFile, logEntry);
    }

    // System events logging
    async system(module, event, data = null) {
        const logEntry = this.formatLogEntry('SYSTEM', module, event, data);
        await this.writeToFile(this.systemLogFile, logEntry);
        
        // Only log important system events to console (skip analytics spam)
        if (module !== 'ANALYTICS' || !event.includes('member tracked')) {
            console.log(`[${module}] 📊 ${event}`);
        }
    }

    // Warning logging (non-critical issues)
    async warn(module, message, data = null) {
        const logEntry = this.formatLogEntry('WARNING', module, message, data);
        await this.writeToFile(this.systemLogFile, logEntry);
        
        console.warn(`[${module}] ⚠️ ${message}`);
    }

    // Info logging (general information)
    async info(module, message, data = null) {
        const logEntry = this.formatLogEntry('INFO', module, message, data);
        await this.writeToFile(this.systemLogFile, logEntry);
    }

    // Log rotation (call this daily to prevent huge files)
    async rotateLogs() {
        try {
            const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0]; // Safe filename format
            const date = new Date().toISOString().split('T')[0];
            const archiveDir = path.join(this.logDir, 'archive', date);
            
            await fs.mkdir(archiveDir, { recursive: true });
            
            const logFiles = [
                { current: this.errorLogFile, name: 'errors.log' },
                { current: this.performanceLogFile, name: 'performance.log' },
                { current: this.commandLogFile, name: 'commands.log' },
                { current: this.moderationLogFile, name: 'moderation.log' },
                { current: this.systemLogFile, name: 'system.log' }
            ];
            
            for (const { current, name } of logFiles) {
                try {
                    // Check if file exists and has content
                    const stats = await fs.stat(current);
                    if (stats.size > 0) {
                        // Create timestamped archive filename
                        const archiveName = `${timestamp}-${name}`;
                        const archivePath = path.join(archiveDir, archiveName);
                        
                        // Copy instead of move to preserve current logs
                        await fs.copyFile(current, archivePath);
                        
                        // Append rotation marker to current file instead of clearing it
                        const rotationMarker = this.formatLogEntry('SYSTEM', 'LOGGER', `Log rotated to archive: ${archiveName}`, { archivePath });
                        await fs.appendFile(current, rotationMarker);
                        
                        await this.system('LOGGER', `Log file archived: ${name} -> ${archiveName}`);
                    }
                } catch (error) {
                    await this.error('LOGGER', `Failed to rotate log file: ${name}`, error);
                }
            }
            
            await this.system('LOGGER', 'Log rotation completed', { timestamp, archiveDir });
        } catch (error) {
            await this.error('LOGGER', 'Log rotation failed', error);
        }
    }

    // Get log statistics
    async getLogStats() {
        try {
            const stats = {};
            const logFiles = [
                { path: this.errorLogFile, name: 'errors' },
                { path: this.performanceLogFile, name: 'performance' },
                { path: this.commandLogFile, name: 'commands' },
                { path: this.moderationLogFile, name: 'moderation' },
                { path: this.systemLogFile, name: 'system' }
            ];
            
            for (const { path: filePath, name } of logFiles) {
                try {
                    const stat = await fs.stat(filePath);
                    stats[name] = {
                        size_mb: (stat.size / 1024 / 1024).toFixed(2),
                        modified: stat.mtime.toISOString()
                    };
                } catch {
                    stats[name] = { size_mb: 0, modified: null };
                }
            }
            
            return stats;
        } catch (error) {
            await this.error('LOGGER', 'Failed to get log statistics', error);
            return {};
        }
    }

    // Performance timer utility
    startTimer(operation) {
        return {
            operation,
            startTime: performance.now(),
            end: async (module, metadata = null) => {
                const duration = performance.now() - this.startTime;
                await this.performance(module, operation, duration, metadata);
                return duration;
            }
        };
    }

    // Get historical log data
    async getHistoricalLogs(logType, startDate = null, endDate = null, limit = 100) {
        try {
            const logFile = this.getLogFileByType(logType);
            if (!logFile) {
                throw new Error(`Unknown log type: ${logType}`);
            }
            
            const content = await fs.readFile(logFile, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim());
            
            let entries = lines.map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            }).filter(entry => entry !== null);
            
            // Filter by date range if specified
            if (startDate || endDate) {
                entries = entries.filter(entry => {
                    const entryDate = new Date(entry.timestamp);
                    if (startDate && entryDate < new Date(startDate)) return false;
                    if (endDate && entryDate > new Date(endDate)) return false;
                    return true;
                });
            }
            
            // Sort by timestamp (newest first) and limit
            entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            return entries.slice(0, limit);
            
        } catch (error) {
            await this.error('LOGGER', 'Failed to get historical logs', error);
            return [];
        }
    }
    
    // Get log file path by type
    getLogFileByType(type) {
        const typeMap = {
            'error': this.errorLogFile,
            'performance': this.performanceLogFile,
            'command': this.commandLogFile,
            'moderation': this.moderationLogFile,
            'system': this.systemLogFile
        };
        return typeMap[type.toLowerCase()];
    }
    
    // Get log summary for a specific time period
    async getLogSummary(hours = 24) {
        try {
            const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
            const summary = {
                timeRange: `${hours} hours`,
                cutoffTime: cutoffTime.toISOString(),
                errors: 0,
                commands: 0,
                performance: 0,
                moderation: 0,
                system: 0,
                topErrors: [],
                topCommands: []
            };
            
            // Count entries by type
            const logTypes = ['error', 'command', 'performance', 'moderation', 'system'];
            
            for (const type of logTypes) {
                const entries = await this.getHistoricalLogs(type, cutoffTime.toISOString());
                summary[type === 'error' ? 'errors' : type] = entries.length;
                
                if (type === 'error') {
                    // Get top error types
                    const errorCounts = {};
                    entries.forEach(entry => {
                        const key = entry.data?.name || entry.message || 'Unknown';
                        errorCounts[key] = (errorCounts[key] || 0) + 1;
                    });
                    summary.topErrors = Object.entries(errorCounts)
                        .sort(([,a], [,b]) => b - a)
                        .slice(0, 5)
                        .map(([error, count]) => ({ error, count }));
                }
                
                if (type === 'command') {
                    // Get top commands
                    const commandCounts = {};
                    entries.forEach(entry => {
                        const cmd = entry.data?.commandName || 'Unknown';
                        commandCounts[cmd] = (commandCounts[cmd] || 0) + 1;
                    });
                    summary.topCommands = Object.entries(commandCounts)
                        .sort(([,a], [,b]) => b - a)
                        .slice(0, 5)
                        .map(([command, count]) => ({ command, count }));
                }
            }
            
            return summary;
        } catch (error) {
            await this.error('LOGGER', 'Failed to get log summary', error);
            return null;
        }
    }

    // Clean up old archived logs (keep specified number of days)
    async cleanupOldLogs(daysToKeep = 30) {
        try {
            const archiveDir = path.join(this.logDir, 'archive');
            const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
            
            try {
                const archiveFolders = await fs.readdir(archiveDir);
                let deletedCount = 0;
                
                for (const folder of archiveFolders) {
                    const folderPath = path.join(archiveDir, folder);
                    const stat = await fs.stat(folderPath);
                    
                    if (stat.isDirectory()) {
                        const folderDate = new Date(folder);
                        
                        if (folderDate < cutoffDate && !isNaN(folderDate.getTime())) {
                            await fs.rm(folderPath, { recursive: true, force: true });
                            deletedCount++;
                            await this.system('LOGGER', `Cleaned up old archive: ${folder}`);
                        }
                    }
                }
                
                if (deletedCount > 0) {
                    await this.system('LOGGER', `Cleaned up ${deletedCount} old archive folders`);
                }
                
                return deletedCount;
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    throw error;
                }
                await this.system('LOGGER', 'No archive directory found - nothing to clean up');
                return 0;
            }
        } catch (error) {
            await this.error('LOGGER', 'Failed to clean up old logs', error);
            return 0;
        }
    }
}

const loggerInstance = new Logger();
loggerInstance.setDiscordClient = setDiscordClient;
module.exports = loggerInstance; 
