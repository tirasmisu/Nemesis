const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

/**
 * Manual log rotation script
 * Usage: node scripts/logRotation.js [days_to_keep]
 */

const DEFAULT_DAYS_TO_KEEP = 30;

async function rotateLogsManually(daysToKeep = DEFAULT_DAYS_TO_KEEP) {
    try {
        console.log('🔄 Starting manual log rotation...');
        
        // Rotate current logs
        await logger.rotateLogs();
        
        // Clean up old archives
        await cleanupOldArchives(daysToKeep);
        
        console.log('✅ Log rotation completed successfully');
        
        // Generate summary
        const stats = await logger.getLogStats();
        console.log('📊 Current log file sizes:');
        for (const [type, stat] of Object.entries(stats)) {
            console.log(`  ${type}: ${stat.size_mb}MB`);
        }
        
    } catch (error) {
        console.error('❌ Error during log rotation:', error);
        process.exit(1);
    }
}

async function cleanupOldArchives(daysToKeep) {
    try {
        const logsDir = path.join(process.cwd(), 'logs');
        const archiveDir = path.join(logsDir, 'archive');
        
        // Check if archive directory exists
        try {
            await fs.access(archiveDir);
        } catch {
            console.log('📁 No archive directory found, skipping cleanup');
            return;
        }
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        
        const archiveFolders = await fs.readdir(archiveDir);
        let deletedCount = 0;
        let totalSize = 0;
        
        for (const folder of archiveFolders) {
            const folderPath = path.join(archiveDir, folder);
            const stat = await fs.stat(folderPath);
            
            if (stat.isDirectory()) {
                const folderDate = new Date(folder);
                
                if (folderDate < cutoffDate && !isNaN(folderDate.getTime())) {
                    // Calculate folder size before deletion
                    const size = await getFolderSize(folderPath);
                    totalSize += size;
                    
                    // Delete old archive folder
                    await fs.rmdir(folderPath, { recursive: true });
                    deletedCount++;
                    console.log(`🗑️  Deleted archive: ${folder} (${(size / 1024 / 1024).toFixed(2)}MB)`);
                }
            }
        }
        
        if (deletedCount > 0) {
            console.log(`🧹 Cleaned up ${deletedCount} old archive folders (${(totalSize / 1024 / 1024).toFixed(2)}MB freed)`);
        } else {
            console.log('✨ No old archives to clean up');
        }
        
    } catch (error) {
        console.error('❌ Error cleaning up old archives:', error);
    }
}

async function getFolderSize(folderPath) {
    let totalSize = 0;
    
    try {
        const items = await fs.readdir(folderPath);
        
        for (const item of items) {
            const itemPath = path.join(folderPath, item);
            const stat = await fs.stat(itemPath);
            
            if (stat.isDirectory()) {
                totalSize += await getFolderSize(itemPath);
            } else {
                totalSize += stat.size;
            }
        }
    } catch (error) {
        // Ignore errors for individual files
    }
    
    return totalSize;
}

async function analyzeLogUsage() {
    try {
        console.log('\n📈 Log Usage Analysis:');
        
        const logsDir = path.join(process.cwd(), 'logs');
        const archiveDir = path.join(logsDir, 'archive');
        
        // Current logs
        const stats = await logger.getLogStats();
        let currentTotal = 0;
        
        for (const [type, stat] of Object.entries(stats)) {
            currentTotal += parseFloat(stat.size_mb);
        }
        
        console.log(`Current logs: ${currentTotal.toFixed(2)}MB`);
        
        // Archive logs
        try {
            const archiveSize = await getFolderSize(archiveDir);
            console.log(`Archive logs: ${(archiveSize / 1024 / 1024).toFixed(2)}MB`);
            
            const archiveFolders = await fs.readdir(archiveDir);
            console.log(`Archive folders: ${archiveFolders.length}`);
            
            if (archiveFolders.length > 0) {
                console.log(`Oldest archive: ${archiveFolders.sort()[0]}`);
                console.log(`Newest archive: ${archiveFolders.sort().reverse()[0]}`);
            }
        } catch {
            console.log('Archive logs: 0MB (no archives)');
        }
        
        // Recommendations
        console.log('\n💡 Recommendations:');
        if (currentTotal > 50) {
            console.log('  ⚠️  Current logs are large (>50MB) - consider rotating');
        }
        
        if (currentTotal < 1) {
            console.log('  ✅ Current log usage is optimal');
        }
        
    } catch (error) {
        console.error('❌ Error analyzing log usage:', error);
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (command === 'analyze') {
        await analyzeLogUsage();
    } else if (command === 'summary') {
        const hours = parseInt(args[1]) || 24;
        await showLogSummary(hours);
    } else if (command === 'history') {
        const logType = args[1] || 'error';
        const limit = parseInt(args[2]) || 10;
        await showLogHistory(logType, limit);
    } else if (command === 'cleanup') {
        const days = parseInt(args[1]) || 30;
        await cleanupOldLogs(days);
    } else if (command === 'help') {
        console.log(`
🗂️  Enhanced Log Management Script

Usage:
  node scripts/logRotation.js [days_to_keep]       - Rotate logs and cleanup old archives
  node scripts/logRotation.js analyze              - Analyze current log usage
  node scripts/logRotation.js summary [hours]      - Show log summary for last N hours (default: 24)
  node scripts/logRotation.js history [type] [limit] - Show recent log entries (default: error, 10)
  node scripts/logRotation.js cleanup [days]       - Clean up old archives (default: 30 days)
  node scripts/logRotation.js help                 - Show this help message

Log Types: error, command, performance, moderation, system

Examples:
  node scripts/logRotation.js                      - Rotate logs, keep 30 days
  node scripts/logRotation.js summary 12           - Show last 12 hours summary
  node scripts/logRotation.js history command 20   - Show last 20 command log entries
  node scripts/logRotation.js cleanup 7            - Clean up archives older than 7 days
        `);
    } else {
        const daysToKeep = parseInt(args[0]) || DEFAULT_DAYS_TO_KEEP;
        console.log(`📅 Keeping ${daysToKeep} days of archives\n`);
        
        await rotateLogsManually(daysToKeep);
        await analyzeLogUsage();
    }
}

// Show log summary for specified hours
async function showLogSummary(hours = 24) {
    try {
        console.log(`\n📊 Log Summary - Last ${hours} hours:`);
        console.log('=' .repeat(50));
        
        const summary = await logger.getLogSummary(hours);
        if (!summary) {
            console.log('❌ Failed to generate log summary');
            return;
        }
        
        console.log(`📈 Activity Summary:`);
        console.log(`  • Errors: ${summary.errors}`);
        console.log(`  • Commands: ${summary.commands}`);
        console.log(`  • Performance logs: ${summary.performance}`);
        console.log(`  • Moderation actions: ${summary.moderation}`);
        console.log(`  • System events: ${summary.system}`);
        
        if (summary.topErrors.length > 0) {
            console.log(`\n🔥 Top Errors:`);
            summary.topErrors.forEach(({ error, count }, index) => {
                console.log(`  ${index + 1}. ${error} (${count} times)`);
            });
        }
        
        if (summary.topCommands.length > 0) {
            console.log(`\n⚡ Top Commands:`);
            summary.topCommands.forEach(({ command, count }, index) => {
                console.log(`  ${index + 1}. ${command} (${count} times)`);
            });
        }
        
        console.log(`\n⏰ Time range: ${summary.cutoffTime} to now`);
        
    } catch (error) {
        console.error('❌ Error generating log summary:', error);
    }
}

// Show recent log history
async function showLogHistory(logType = 'error', limit = 10) {
    try {
        console.log(`\n📜 Recent ${logType} logs (last ${limit} entries):`);
        console.log('=' .repeat(60));
        
        const entries = await logger.getHistoricalLogs(logType, null, null, limit);
        
        if (entries.length === 0) {
            console.log(`No ${logType} logs found`);
            return;
        }
        
        entries.forEach((entry, index) => {
            const timestamp = new Date(entry.timestamp).toLocaleString();
            console.log(`\n${index + 1}. [${timestamp}] ${entry.level} - ${entry.module}`);
            console.log(`   Message: ${entry.message}`);
            
            if (entry.data) {
                if (entry.data.stack) {
                    console.log(`   Stack: ${entry.data.stack.split('\n')[0]}`);
                }
                if (entry.data.commandName) {
                    console.log(`   Command: ${entry.data.commandName}`);
                }
                if (entry.data.success !== undefined) {
                    console.log(`   Success: ${entry.data.success}`);
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Error showing log history:', error);
    }
}

// Clean up old archives
async function cleanupOldLogs(days = 30) {
    try {
        console.log(`\n🧹 Cleaning up archives older than ${days} days...`);
        const deletedCount = await logger.cleanupOldLogs(days);
        
        if (deletedCount > 0) {
            console.log(`✅ Cleaned up ${deletedCount} old archive folders`);
        } else {
            console.log(`✨ No old archives to clean up`);
        }
        
    } catch (error) {
        console.error('❌ Error cleaning up old logs:', error);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    rotateLogsManually,
    cleanupOldArchives,
    analyzeLogUsage
}; 
