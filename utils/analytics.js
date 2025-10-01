const logger = require('./logger');

class AnalyticsManager {
    constructor() {
        this.analytics = {
            // Daily metrics
            dailyMessages: 0,
            dailyCommands: 0,
            newMembers: 0,
            dailyVoiceMinutes: 0,
            
            // Command usage tracking
            commandUsage: new Map(),
            
            // Channel activity
            popularChannels: new Map(),
            
            // Active hours (24-hour format)
            activeHours: Array(24).fill(0),
            
            // User engagement
            activeUsers: new Set(),
            messagesByUser: new Map(),
            
            // Weekly/Monthly data
            weeklyData: {
                messages: 0,
                commands: 0,
                newMembers: 0,
                voiceMinutes: 0
            },
            
            // Special events tracking
            events: [],
            
            // Moderation stats
            moderation: {
                warnings: 0,
                mutes: 0,
                kicks: 0,
                bans: 0,
                deletedMessages: 0
            }
        };
        
        this.startTime = Date.now();
        this.resetInterval = null;
        this.reportInterval = null;
        
        this.initializeReporting();
    }

    initializeReporting() {
        // Reset daily stats at midnight
        this.resetInterval = setInterval(() => {
            this.resetDailyStats();
        }, 24 * 60 * 60 * 1000); // 24 hours
        
        // Generate reports every 6 hours
        this.reportInterval = setInterval(async () => {
            await this.generatePerformanceReport();
        }, 6 * 60 * 60 * 1000); // 6 hours
        
        logger.system('ANALYTICS', 'Analytics reporting initialized');
    }

    // Track message activity
    trackMessage(channelId, userId, content) {
        this.analytics.dailyMessages++;
        this.analytics.weeklyData.messages++;
        
        // Track channel activity
        const channelCount = this.analytics.popularChannels.get(channelId) || 0;
        this.analytics.popularChannels.set(channelId, channelCount + 1);
        
        // Track user activity
        this.analytics.activeUsers.add(userId);
        const userMessages = this.analytics.messagesByUser.get(userId) || 0;
        this.analytics.messagesByUser.set(userId, userMessages + 1);
        
        // Track active hours
        const hour = new Date().getHours();
        this.analytics.activeHours[hour]++;
        
        // Log periodically (every 100 messages)
        if (this.analytics.dailyMessages % 100 === 0) {
            logger.info('ANALYTICS', `Message milestone: ${this.analytics.dailyMessages} daily messages`);
        }
    }

    // Track command usage
    trackCommand(commandName, userId, success = true, responseTime = 0) {
        this.analytics.dailyCommands++;
        this.analytics.weeklyData.commands++;
        
        // Track specific command usage
        const commandStats = this.analytics.commandUsage.get(commandName) || {
            uses: 0,
            failures: 0,
            totalResponseTime: 0,
            averageResponseTime: 0
        };
        
        commandStats.uses++;
        if (!success) {
            commandStats.failures++;
        }
        
        commandStats.totalResponseTime += responseTime;
        commandStats.averageResponseTime = commandStats.totalResponseTime / commandStats.uses;
        
        this.analytics.commandUsage.set(commandName, commandStats);
        
        // Track user activity
        this.analytics.activeUsers.add(userId);
    }

    // Track new member joins
    trackNewMember(userId, joinType = 'normal') {
        this.analytics.newMembers++;
        this.analytics.weeklyData.newMembers++;
        
        // Only log if it's a significant event (first join of the day, etc.)
        // Reduced spam by removing individual member join logs
    }

    // Track voice activity
    trackVoiceActivity(userId, duration) {
        const minutes = Math.round(duration / 60000); // Convert ms to minutes
        this.analytics.dailyVoiceMinutes += minutes;
        this.analytics.weeklyData.voiceMinutes += minutes;
        
        this.analytics.activeUsers.add(userId);
    }

    // Track moderation actions
    trackModerationAction(action, moderatorId, targetId, reason = '') {
        switch (action.toLowerCase()) {
            case 'warn':
            case 'warning':
                this.analytics.moderation.warnings++;
                break;
            case 'mute':
                this.analytics.moderation.mutes++;
                break;
            case 'kick':
                this.analytics.moderation.kicks++;
                break;
            case 'ban':
                this.analytics.moderation.bans++;
                break;
            case 'delete':
            case 'deletemessage':
                this.analytics.moderation.deletedMessages++;
                break;
        }
        
        logger.moderation(moderatorId, targetId, action, reason, {
            dailyTotal: Object.values(this.analytics.moderation).reduce((a, b) => a + b, 0)
        });
    }

    // Track special events
    trackEvent(eventName, eventData = {}) {
        const event = {
            name: eventName,
            timestamp: new Date().toISOString(),
            data: eventData
        };
        
        this.analytics.events.push(event);
        
        // Keep only last 100 events
        if (this.analytics.events.length > 100) {
            this.analytics.events = this.analytics.events.slice(-100);
        }
        
        logger.system('ANALYTICS', `Event tracked: ${eventName}`, eventData);
    }

    // Get current analytics summary
    getAnalyticsSummary() {
        const uptime = Date.now() - this.startTime;
        const uptimeHours = Math.round(uptime / (1000 * 60 * 60));
        
        return {
            uptime: {
                hours: uptimeHours,
                formatted: this.formatUptime(uptime)
            },
            today: {
                messages: this.analytics.dailyMessages,
                commands: this.analytics.dailyCommands,
                newMembers: this.analytics.newMembers,
                voiceMinutes: this.analytics.dailyVoiceMinutes,
                activeUsers: this.analytics.activeUsers.size
            },
            week: this.analytics.weeklyData,
            topCommands: this.getTopCommands(5),
            popularChannels: this.getPopularChannels(5),
            peakHours: this.getPeakActivityHours(),
            moderation: this.analytics.moderation,
            recentEvents: this.analytics.events.slice(-5)
        };
    }

    // Get top commands by usage
    getTopCommands(limit = 10) {
        return Array.from(this.analytics.commandUsage.entries())
            .sort((a, b) => b[1].uses - a[1].uses)
            .slice(0, limit)
            .map(([command, stats]) => ({
                command,
                uses: stats.uses,
                failures: stats.failures,
                successRate: ((stats.uses - stats.failures) / stats.uses * 100).toFixed(1) + '%',
                avgResponseTime: Math.round(stats.averageResponseTime) + 'ms'
            }));
    }

    // Get most popular channels
    getPopularChannels(limit = 10) {
        return Array.from(this.analytics.popularChannels.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([channelId, messages]) => ({
                channelId,
                messages,
                percentage: ((messages / this.analytics.dailyMessages) * 100).toFixed(1) + '%'
            }));
    }

    // Get peak activity hours
    getPeakActivityHours() {
        const hours = this.analytics.activeHours
            .map((activity, hour) => ({ hour, activity }))
            .sort((a, b) => b.activity - a.activity)
            .slice(0, 3);
        
        return hours.map(h => ({
            hour: h.hour,
            activity: h.activity,
            formatted: `${h.hour}:00 - ${h.hour + 1}:00`
        }));
    }

    // Generate comprehensive analytics report
    async generateAnalyticsReport() {
        const summary = this.getAnalyticsSummary();
        
        const report = {
            generatedAt: new Date().toISOString(),
            summary,
            insights: this.generateInsights(summary),
            recommendations: this.generateRecommendations(summary)
        };
        
        await logger.system('ANALYTICS', 'Analytics report generated', report);
        return report;
    }

    // Generate insights from data
    generateInsights(summary) {
        const insights = [];
        
        // Message activity insights
        if (summary.today.messages > 1000) {
            insights.push({
                type: 'high_activity',
                message: `High server activity today with ${summary.today.messages} messages`
            });
        }
        
        // Command usage insights
        if (summary.topCommands.length > 0) {
            const topCommand = summary.topCommands[0];
            insights.push({
                type: 'popular_command',
                message: `Most used command: ${topCommand.command} (${topCommand.uses} uses)`
            });
        }
        
        // Growth insights
        if (summary.today.newMembers > 10) {
            insights.push({
                type: 'growth',
                message: `Strong growth today with ${summary.today.newMembers} new members`
            });
        }
        
        // Engagement insights
        const messagePerUser = summary.today.activeUsers > 0 ? 
            Math.round(summary.today.messages / summary.today.activeUsers) : 0;
        
        if (messagePerUser > 10) {
            insights.push({
                type: 'engagement',
                message: `High user engagement: ${messagePerUser} messages per active user`
            });
        }
        
        return insights;
    }

    // Generate recommendations
    generateRecommendations(summary) {
        const recommendations = [];
        
        // Peak hours recommendation
        if (summary.peakHours.length > 0) {
            const peakHour = summary.peakHours[0];
            recommendations.push({
                type: 'scheduling',
                message: `Schedule events around ${peakHour.formatted} for maximum engagement`
            });
        }
        
        // Popular channels recommendation
        if (summary.popularChannels.length > 0) {
            const topChannel = summary.popularChannels[0];
            recommendations.push({
                type: 'content',
                message: `Focus content on popular channels for better reach`
            });
        }
        
        // Command optimization
        const failingCommands = this.getFailingCommands();
        if (failingCommands.length > 0) {
            recommendations.push({
                type: 'technical',
                message: `Review failing commands: ${failingCommands.join(', ')}`
            });
        }
        
        return recommendations;
    }

    // Get commands with high failure rates
    getFailingCommands() {
        return Array.from(this.analytics.commandUsage.entries())
            .filter(([_, stats]) => stats.failures / stats.uses > 0.1) // >10% failure rate
            .map(([command, _]) => command);
    }

    // Generate performance report
    async generatePerformanceReport() {
        const summary = this.getAnalyticsSummary();
        
        await logger.system('ANALYTICS', 'Performance report', {
            timestamp: new Date().toISOString(),
            metrics: {
                messagesPerHour: Math.round(summary.today.messages / summary.uptime.hours),
                commandsPerHour: Math.round(summary.today.commands / summary.uptime.hours),
                userEngagement: summary.today.activeUsers,
                serverHealth: 'optimal' // This could be enhanced with health checks
            }
        });
    }

    // Reset daily statistics
    resetDailyStats() {
        logger.system('ANALYTICS', 'Resetting daily statistics', {
            previousDayStats: {
                messages: this.analytics.dailyMessages,
                commands: this.analytics.dailyCommands,
                newMembers: this.analytics.newMembers,
                voiceMinutes: this.analytics.dailyVoiceMinutes
            }
        });
        
        this.analytics.dailyMessages = 0;
        this.analytics.dailyCommands = 0;
        this.analytics.newMembers = 0;
        this.analytics.dailyVoiceMinutes = 0;
        this.analytics.activeUsers.clear();
        this.analytics.messagesByUser.clear();
        this.analytics.popularChannels.clear();
        this.analytics.activeHours.fill(0);
        
        // Reset moderation stats
        Object.keys(this.analytics.moderation).forEach(key => {
            this.analytics.moderation[key] = 0;
        });
    }

    // Format uptime duration
    formatUptime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else {
            return `${minutes}m`;
        }
    }

    // Clean up intervals
    destroy() {
        if (this.resetInterval) {
            clearInterval(this.resetInterval);
        }
        if (this.reportInterval) {
            clearInterval(this.reportInterval);
        }
        logger.system('ANALYTICS', 'Analytics manager destroyed');
    }
}

module.exports = new AnalyticsManager(); 
