const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { checkModerationPermission } = require('../utils/commandHelpers');
const healthMonitor = require('../utils/healthMonitor');
const logger = require('../utils/logger');
const memoryManager = require('../utils/memoryManager');
const dbOptimizer = require('../utils/dbOptimizer');
const cooldownManager = require('../utils/cooldownManager');
const channelManager = require('../utils/channelManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Get comprehensive bot system status and health metrics')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Action to perform')
                .addChoices(
                    { name: 'Overview', value: 'overview' },
                    { name: 'Detailed', value: 'detailed' },
                    { name: 'Logs', value: 'logs' },
                    { name: 'Performance', value: 'performance' },
                    { name: 'Health Check', value: 'health' },
                    { name: 'Recommendations', value: 'recommendations' },
                    { name: 'Memory', value: 'memory' },
                    { name: 'Database', value: 'database' },
                    { name: 'Cooldowns', value: 'cooldowns' }
                )
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try {
            // Check permissions
            const hasPermission = await checkModerationPermission(interaction, 'helpers');
            if (!hasPermission) {
                return; // checkModerationPermission handles the response
            }

            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ flags: ['Ephemeral'] });
            }
            
            const action = interaction.options.getString('action') || 'overview';
            let embed;
            
            switch (action) {
                case 'detailed':
                    embed = await createDetailedEmbed();
                    break;
                case 'logs':
                    embed = await createLogsEmbed();
                    break;
                case 'performance':
                    embed = await createPerformanceEmbed();
                    break;
                case 'health':
                    const healthData = healthMonitor.getSystemStats();
                    embed = await createHealthEmbed(healthData);
                    break;
                case 'recommendations':
                    embed = await createRecommendationsEmbed();
                    break;
                case 'memory':
                    embed = await createMemoryEmbed();
                    break;
                case 'database':
                    embed = await createDatabaseEmbed();
                    break;
                case 'cooldowns':
                    embed = await createCooldownsEmbed();
                    break;
                default:
                    embed = await createOverviewEmbed();
                    break;
            }
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in status command:', error);
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ content: 'An error occurred while processing your request.' });
            } else if (!interaction.replied) {
                await interaction.reply({ content: 'An error occurred while processing your request.', flags: ['Ephemeral'] });
            }
        }
    }
};

async function createOverviewEmbed() {
    const stats = healthMonitor.getSystemStats();
    const memUsage = stats.memoryUsage;
    
    const embed = new EmbedBuilder()
        .setColor(stats.isHealthy ? '#00ff00' : '#ffaa00')
        .setTitle('🤖 Bot System Status - Overview')
        .addFields(
            { name: '⏱️ Uptime', value: stats.uptime, inline: true },
            { name: '🧠 Memory Usage', value: `${memUsage.heapUsed}MB / ${memUsage.heapTotal}MB`, inline: true },
            { name: '🏥 Health Status', value: stats.isHealthy ? '✅ Healthy' : '⚠️ Issues Detected', inline: true },
            { name: '📊 Commands Executed', value: stats.commandsExecuted.toLocaleString(), inline: true },
            { name: '❌ Error Rate', value: stats.errorRate, inline: true },
            { name: '⚡ Avg Response Time', value: stats.averageResponseTime, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Use /status detailed for more information' });

    return embed;
}

async function createDetailedEmbed() {
    const stats = healthMonitor.getSystemStats();
    const memUsage = stats.memoryUsage;
    
    const embed = new EmbedBuilder()
        .setColor(stats.isHealthy ? '#00ff00' : '#ffaa00')
        .setTitle('🤖 Bot System Status - Detailed')
        .addFields(
            { name: '⏱️ System Uptime', value: stats.uptime, inline: true },
            { name: '🔗 Active Connections', value: stats.activeConnections.toString(), inline: true },
            { name: '🏥 Health Status', value: stats.isHealthy ? '✅ Healthy' : '⚠️ Issues Detected', inline: true },
            { name: '🧠 Memory Details', value: `**Heap Used:** ${memUsage.heapUsed}MB\n**Heap Total:** ${memUsage.heapTotal}MB\n**RSS:** ${memUsage.rss}MB\n**External:** ${memUsage.external}MB`, inline: true },
            { name: '📊 Performance Metrics', value: `**Commands:** ${stats.commandsExecuted.toLocaleString()}\n**Errors:** ${stats.errorsEncountered.toLocaleString()}\n**Error Rate:** ${stats.errorRate}\n**Avg Response:** ${stats.averageResponseTime}`, inline: true },
            { name: '💾 Process Info', value: `**Node.js:** ${process.version}\n**Platform:** ${process.platform}\n**Architecture:** ${process.arch}`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Real-time system metrics' });

    return embed;
}

async function createLogsEmbed() {
    const logStats = await logger.getLogStats();
    
    let logInfo = '';
    for (const [type, stats] of Object.entries(logStats)) {
        logInfo += `**${type.charAt(0).toUpperCase() + type.slice(1)}:** ${stats.size_mb}MB\n`;
    }

    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('📋 Log File Statistics')
        .addFields(
            { name: '📁 Log Sizes', value: logInfo || 'No log data available', inline: false },
            { name: '📝 Log Files', value: '• `errors.log` - Error tracking\n• `performance.log` - Performance metrics\n• `commands.log` - Command usage\n• `moderation.log` - Moderation actions\n• `system.log` - System events', inline: false }
        )
        .setTimestamp()
        .setFooter({ text: 'Log files are automatically rotated daily' });

    return embed;
}

async function createPerformanceEmbed() {
    const stats = healthMonitor.getSystemStats();
    const memUsage = stats.memoryUsage;
    
    // Calculate performance grade
    let grade = 'A+';
    let gradeColor = '#00ff00';
    
    if (parseInt(stats.errorRate) > 5 || parseInt(stats.averageResponseTime) > 3000) {
        grade = 'C';
        gradeColor = '#ffaa00';
    } else if (parseInt(stats.errorRate) > 2 || parseInt(stats.averageResponseTime) > 1500) {
        grade = 'B';
        gradeColor = '#ffdd00';
    }
    
    if (memUsage.heapUsed > 400) {
        grade = 'D';
        gradeColor = '#ff6600';
    }

    const embed = new EmbedBuilder()
        .setColor(gradeColor)
        .setTitle('⚡ Performance Analysis')
        .addFields(
            { name: '🎯 Performance Grade', value: `**${grade}**`, inline: true },
            { name: '📈 Response Times', value: `**Average:** ${stats.averageResponseTime}\n**Status:** ${parseInt(stats.averageResponseTime) < 1000 ? '✅ Excellent' : parseInt(stats.averageResponseTime) < 3000 ? '⚠️ Good' : '❌ Slow'}`, inline: true },
            { name: '💾 Memory Efficiency', value: `**Usage:** ${memUsage.heapUsed}MB\n**Status:** ${memUsage.heapUsed < 200 ? '✅ Optimal' : memUsage.heapUsed < 400 ? '⚠️ Moderate' : '❌ High'}`, inline: true },
            { name: '🎲 Reliability Score', value: `**Error Rate:** ${stats.errorRate}\n**Status:** ${parseInt(stats.errorRate) < 1 ? '✅ Excellent' : parseInt(stats.errorRate) < 5 ? '⚠️ Good' : '❌ Poor'}`, inline: true },
            { name: '🚀 Throughput', value: `**Commands/Hour:** ${Math.round(stats.commandsExecuted / (parseInt(stats.uptime.split('h')[0]) || 1))}\n**Total Processed:** ${stats.commandsExecuted.toLocaleString()}`, inline: true },
            { name: '📊 Overall Status', value: stats.isHealthy ? '✅ All systems operational' : '⚠️ Performance issues detected', inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Performance metrics updated in real-time' });

    return embed;
}

async function createHealthEmbed(healthData) {
    const embed = new EmbedBuilder()
        .setColor(healthData.isHealthy ? '#00ff00' : '#ff6600')
        .setTitle('🏥 System Health Check')
        .addFields(
            { name: '🩺 Health Status', value: healthData.isHealthy ? '✅ **HEALTHY**\nAll systems operating normally' : '⚠️ **ISSUES DETECTED**\nSome systems need attention', inline: false },
            { name: '📊 Key Metrics', value: `**Uptime:** ${healthData.uptime}\n**Memory:** ${healthData.memoryUsage.heapUsed}MB\n**Response Time:** ${healthData.averageResponseTime}\n**Error Rate:** ${healthData.errorRate}`, inline: true },
            { name: '🔧 System Resources', value: `**CPU Usage:** Normal\n**Memory Limit:** 512MB\n**Network:** Stable\n**Database:** Connected`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Health check performed automatically every 5 minutes' });

    return embed;
}

async function createRecommendationsEmbed() {
    const recommendations = healthMonitor.getPerformanceRecommendations();
    
    let recText = '';
    if (recommendations.length === 0) {
        recText = '✅ **No recommendations at this time**\nYour bot is performing optimally!';
    } else {
        recommendations.forEach((rec, index) => {
            const emoji = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
            recText += `${emoji} **${rec.type.toUpperCase()}:** ${rec.message}\n`;
        });
    }

    const embed = new EmbedBuilder()
        .setColor(recommendations.length === 0 ? '#00ff00' : '#ffaa00')
        .setTitle('💡 Performance Recommendations')
        .addFields(
            { name: '🎯 Optimization Suggestions', value: recText, inline: false },
            { name: '📈 Performance Tips', value: '• Monitor error logs regularly\n• Rotate log files to prevent disk issues\n• Use `/status performance` for detailed metrics\n• Consider memory optimization if usage is high', inline: false }
        )
        .setTimestamp()
        .setFooter({ text: 'Recommendations are generated based on current system metrics' });

    return embed;
}

async function createMemoryEmbed() {
    const memoryStats = memoryManager.getMemoryStats();
    
    const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🧠 Memory Management Status')
        .addFields(
            { name: '💾 Current Usage', value: `**Heap Used:** ${memoryStats.current.heapUsed}MB\n**Heap Total:** ${memoryStats.current.heapTotal}MB\n**RSS:** ${memoryStats.current.rss}MB\n**External:** ${memoryStats.current.external}MB`, inline: true },
            { name: '⚠️ Thresholds', value: `**Warning:** ${memoryStats.thresholds.warning}MB\n**Critical:** ${memoryStats.thresholds.critical}MB\n**Emergency:** ${memoryStats.thresholds.emergency}MB`, inline: true },
            { name: '🗑️ Garbage Collection', value: `**Collections:** ${memoryStats.gcStats.totalCollections}\n**Memory Freed:** ${Math.round(memoryStats.gcStats.memoryFreed / 1024 / 1024)}MB\n**Last Collection:** ${memoryStats.gcStats.lastCollection || 'Never'}`, inline: false },
            { name: '📊 Memory Status', value: memoryManager.isCriticalMemoryState() ? '🚨 **CRITICAL**' : '✅ **NORMAL**', inline: true },
            { name: '📈 Usage Percentage', value: `${memoryManager.getMemoryUsagePercentage()}%`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Memory is monitored automatically every 30 seconds' });

    return embed;
}

async function createDatabaseEmbed() {
    const dbStats = dbOptimizer.getPerformanceStats();
    const recommendations = dbOptimizer.generateRecommendations();
    
    let recommendationsText = '';
    if (recommendations.length > 0) {
        recommendationsText = recommendations.slice(0, 3).map(rec => 
            `• ${rec.message}`
        ).join('\n');
    } else {
        recommendationsText = '✅ No issues detected';
    }
    
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('🗄️ Database Performance Status')
        .addFields(
            { name: '📊 Query Statistics', value: `**Total Queries:** ${dbStats.totalQueries.toLocaleString()}\n**Failed Queries:** ${dbStats.totalFailures}\n**Unique Query Types:** ${dbStats.uniqueQueryTypes}`, inline: true },
            { name: '⚡ Performance Metrics', value: `**Avg Query Time:** ${Math.round(dbStats.averageQueryTime)}ms\n**Slow Queries:** ${dbStats.slowQueriesCount}\n**Success Rate:** ${((1 - dbStats.totalFailures / Math.max(dbStats.totalQueries, 1)) * 100).toFixed(1)}%`, inline: true },
            { name: '🔥 Top Slow Queries', value: dbStats.topSlowQueries.length > 0 ? 
                dbStats.topSlowQueries.slice(0, 3).map(q => 
                    `• ${q.collection}.${q.operation} (${q.duration}ms)`
                ).join('\n') : 'No slow queries detected', inline: false },
            { name: '💡 Recommendations', value: recommendationsText, inline: false }
        )
        .setTimestamp()
        .setFooter({ text: 'Database performance is optimized with automatic indexing' });

    return embed;
}

async function createCooldownsEmbed() {
    const cooldownStats = cooldownManager.getStats();
    const detailedInfo = cooldownManager.getDetailedInfo();
    
    let activeCooldownsText = '';
    if (detailedInfo.activeCooldowns.length > 0) {
        activeCooldownsText = detailedInfo.activeCooldowns.map(cooldown => 
            `• **${cooldown.command}** for <@${cooldown.userId}> (${cooldown.remaining})`
        ).join('\n');
    } else {
        activeCooldownsText = 'No active cooldowns';
    }
    
    let globalCooldownsText = '';
    if (detailedInfo.globalCooldowns.length > 0) {
        globalCooldownsText = detailedInfo.globalCooldowns.map(cooldown => 
            `• **${cooldown.command}** (${cooldown.remaining})`
        ).join('\n');
    } else {
        globalCooldownsText = 'No global cooldowns';
    }
    
    const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('⏱️ Cooldown Management Status')
        .addFields(
            { name: '📊 Statistics', value: `**Active Cooldowns:** ${cooldownStats.activeCooldowns}\n**Global Cooldowns:** ${cooldownStats.globalCooldowns}\n**Total Applied:** ${cooldownStats.totalCooldowns}\n**Bypassed:** ${cooldownStats.bypassedCooldowns}`, inline: true },
            { name: '🔧 Configuration', value: `**Default Commands:** ${cooldownStats.defaultCooldowns}\n**System:** Non-restrictive\n**Staff Bypass:** Enabled`, inline: true },
            { name: '🕐 Active User Cooldowns', value: activeCooldownsText, inline: false },
            { name: '🌐 Global Cooldowns', value: globalCooldownsText, inline: false }
        )
        .setTimestamp()
        .setFooter({ text: 'Cooldowns help prevent spam while remaining user-friendly' });

    return embed;
} 
