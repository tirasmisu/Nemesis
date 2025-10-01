const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

/**
 * Simple log viewer script
 * Usage: node scripts/viewLogs.js [command] [options]
 */

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

// Colorize log levels
function colorizeLevel(level) {
    switch (level?.toLowerCase()) {
        case 'error': return `${colors.red}${level}${colors.reset}`;
        case 'warning': return `${colors.yellow}${level}${colors.reset}`;
        case 'info': return `${colors.blue}${level}${colors.reset}`;
        case 'system': return `${colors.green}${level}${colors.reset}`;
        case 'command': return `${colors.cyan}${level}${colors.reset}`;
        case 'performance': return `${colors.magenta}${level}${colors.reset}`;
        default: return level;
    }
}

// Display log entry in a readable format
function displayLogEntry(entry, index) {
    const timestamp = new Date(entry.timestamp).toLocaleString();
    const level = colorizeLevel(entry.level);
    const module = `${colors.bright}${entry.module}${colors.reset}`;
    
    console.log(`${colors.bright}${index + 1}.${colors.reset} [${timestamp}] ${level} - ${module}`);
    console.log(`   ${colors.cyan}Message:${colors.reset} ${entry.message}`);
    
    if (entry.data) {
        if (entry.data.stack) {
            const stackLine = entry.data.stack.split('\n')[0];
            console.log(`   ${colors.red}Stack:${colors.reset} ${stackLine}`);
        }
        if (entry.data.commandName) {
            console.log(`   ${colors.blue}Command:${colors.reset} ${entry.data.commandName}`);
        }
        if (entry.data.success !== undefined) {
            const successColor = entry.data.success ? colors.green : colors.red;
            console.log(`   ${colors.yellow}Success:${colors.reset} ${successColor}${entry.data.success}${colors.reset}`);
        }
        if (entry.data.userId) {
            console.log(`   ${colors.magenta}User ID:${colors.reset} ${entry.data.userId}`);
        }
        if (entry.data.guildId) {
            console.log(`   ${colors.magenta}Guild ID:${colors.reset} ${entry.data.guildId}`);
        }
        if (entry.data.duration_ms) {
            console.log(`   ${colors.yellow}Duration:${colors.reset} ${entry.data.duration_ms}ms`);
        }
    }
    console.log('');
}

// Show recent logs by type
async function showLogs(type = 'error', limit = 20) {
    try {
        console.log(`${colors.bright}📜 Recent ${type} logs (last ${limit} entries):${colors.reset}`);
        console.log('═'.repeat(80));
        
        const entries = await logger.getHistoricalLogs(type, null, null, limit);
        
        if (entries.length === 0) {
            console.log(`${colors.yellow}No ${type} logs found${colors.reset}`);
            return;
        }
        
        entries.forEach((entry, index) => {
            displayLogEntry(entry, index);
        });
        
        console.log(`${colors.green}Found ${entries.length} ${type} log entries${colors.reset}`);
        
    } catch (error) {
        console.error(`${colors.red}❌ Error showing logs:${colors.reset}`, error);
    }
}

// Search logs for specific text
async function searchLogs(searchTerm, type = 'all', limit = 50) {
    try {
        console.log(`${colors.bright}🔍 Searching for "${searchTerm}" in ${type} logs:${colors.reset}`);
        console.log('═'.repeat(80));
        
        const logTypes = type === 'all' ? ['error', 'command', 'performance', 'moderation', 'system'] : [type];
        let foundEntries = [];
        
        for (const logType of logTypes) {
            const entries = await logger.getHistoricalLogs(logType, null, null, 1000);
            const matches = entries.filter(entry => {
                const searchableText = JSON.stringify(entry).toLowerCase();
                return searchableText.includes(searchTerm.toLowerCase());
            });
            
            foundEntries.push(...matches.map(entry => ({ ...entry, logType })));
        }
        
        // Sort by timestamp (newest first) and limit
        foundEntries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        foundEntries = foundEntries.slice(0, limit);
        
        if (foundEntries.length === 0) {
            console.log(`${colors.yellow}No logs found containing "${searchTerm}"${colors.reset}`);
            return;
        }
        
        foundEntries.forEach((entry, index) => {
            console.log(`${colors.cyan}[${entry.logType}]${colors.reset}`);
            displayLogEntry(entry, index);
        });
        
        console.log(`${colors.green}Found ${foundEntries.length} matching log entries${colors.reset}`);
        
    } catch (error) {
        console.error(`${colors.red}❌ Error searching logs:${colors.reset}`, error);
    }
}

// Show log summary
async function showSummary(hours = 24) {
    try {
        console.log(`${colors.bright}📊 Log Summary - Last ${hours} hours:${colors.reset}`);
        console.log('═'.repeat(50));
        
        const summary = await logger.getLogSummary(hours);
        if (!summary) {
            console.log(`${colors.red}❌ Failed to generate log summary${colors.reset}`);
            return;
        }
        
        console.log(`${colors.bright}📈 Activity Summary:${colors.reset}`);
        console.log(`  • ${colorizeLevel('Error')}s: ${summary.errors}`);
        console.log(`  • ${colorizeLevel('Command')}s: ${summary.commands}`);
        console.log(`  • ${colorizeLevel('Performance')} logs: ${summary.performance}`);
        console.log(`  • ${colorizeLevel('Moderation')} actions: ${summary.moderation}`);
        console.log(`  • ${colorizeLevel('System')} events: ${summary.system}`);
        
        if (summary.topErrors.length > 0) {
            console.log(`\n${colors.red}🔥 Top Errors:${colors.reset}`);
            summary.topErrors.forEach(({ error, count }, index) => {
                console.log(`  ${index + 1}. ${error} (${count} times)`);
            });
        }
        
        if (summary.topCommands.length > 0) {
            console.log(`\n${colors.cyan}⚡ Top Commands:${colors.reset}`);
            summary.topCommands.forEach(({ command, count }, index) => {
                console.log(`  ${index + 1}. ${command} (${count} times)`);
            });
        }
        
        console.log(`\n${colors.yellow}⏰ Time range:${colors.reset} ${summary.cutoffTime} to now`);
        
    } catch (error) {
        console.error(`${colors.red}❌ Error generating log summary:${colors.reset}`, error);
    }
}

// Show errors only
async function showErrors(hours = 24) {
    try {
        const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
        console.log(`${colors.bright}🚨 Errors in last ${hours} hours:${colors.reset}`);
        console.log('═'.repeat(60));
        
        const entries = await logger.getHistoricalLogs('error', startTime.toISOString(), null, 100);
        
        if (entries.length === 0) {
            console.log(`${colors.green}✅ No errors found in the last ${hours} hours!${colors.reset}`);
            return;
        }
        
        entries.forEach((entry, index) => {
            displayLogEntry(entry, index);
        });
        
        console.log(`${colors.red}Found ${entries.length} error(s) in the last ${hours} hours${colors.reset}`);
        
    } catch (error) {
        console.error(`${colors.red}❌ Error showing errors:${colors.reset}`, error);
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (command === 'errors') {
        const hours = parseInt(args[1]) || 24;
        await showErrors(hours);
    } else if (command === 'search') {
        const searchTerm = args[1];
        const type = args[2] || 'all';
        const limit = parseInt(args[3]) || 50;
        
        if (!searchTerm) {
            console.log(`${colors.red}❌ Please provide a search term${colors.reset}`);
            return;
        }
        
        await searchLogs(searchTerm, type, limit);
    } else if (command === 'summary') {
        const hours = parseInt(args[1]) || 24;
        await showSummary(hours);
    } else if (command === 'help') {
        console.log(`
${colors.bright}📋 Log Viewer Script${colors.reset}

Usage:
  node scripts/viewLogs.js [command] [options]

Commands:
  ${colors.cyan}errors [hours]${colors.reset}              - Show errors from last N hours (default: 24)
  ${colors.cyan}search <term> [type] [limit]${colors.reset} - Search logs for specific text
  ${colors.cyan}summary [hours]${colors.reset}             - Show activity summary for last N hours
  ${colors.cyan}help${colors.reset}                        - Show this help message
  ${colors.cyan}[type] [limit]${colors.reset}              - Show recent logs of specified type

Log Types: ${colors.yellow}error, command, performance, moderation, system${colors.reset}

Examples:
  ${colors.green}node scripts/viewLogs.js errors 12${colors.reset}           - Show errors from last 12 hours
  ${colors.green}node scripts/viewLogs.js search "Discord" error${colors.reset}  - Search for "Discord" in error logs
  ${colors.green}node scripts/viewLogs.js command 30${colors.reset}           - Show last 30 command logs
  ${colors.green}node scripts/viewLogs.js summary 6${colors.reset}            - Show 6-hour activity summary
        `);
    } else {
        // Default: show logs by type
        const type = command || 'error';
        const limit = parseInt(args[1]) || 20;
        await showLogs(type, limit);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    showLogs,
    searchLogs,
    showSummary,
    showErrors
}; 