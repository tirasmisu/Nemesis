const logger = require('./logger');
const { performance } = require('perf_hooks');

class HealthMonitor {
    constructor() {
        this.metrics = {
            startTime: Date.now(),
            commandsExecuted: 0,
            errorsEncountered: 0,
            averageResponseTime: 0,
            responseTimes: [],
            memoryUsage: [],
            activeConnections: 0
        };
        
        this.thresholds = {
            maxMemoryUsageMB: 512,
            maxResponseTimeMs: 5000,
            maxErrorRate: 0.05, // 5% error rate
            maxResponseTimeHistory: 100 // Keep last 100 response times
        };
        
        this.healthCheckInterval = null;
        this.isHealthy = true;
        
        this.startMonitoring();
    }

    startMonitoring() {
        // Run health checks every 5 minutes
        this.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, 5 * 60 * 1000);
        
        logger.system('HEALTH_MONITOR', 'Health monitoring started');
    }

    stopMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        logger.system('HEALTH_MONITOR', 'Health monitoring stopped');
    }

    // Record command execution
    recordCommand(responseTime, success = true) {
        this.metrics.commandsExecuted++;
        
        if (!success) {
            this.metrics.errorsEncountered++;
        }
        
        // Track response times
        this.metrics.responseTimes.push(responseTime);
        if (this.metrics.responseTimes.length > this.thresholds.maxResponseTimeHistory) {
            this.metrics.responseTimes.shift();
        }
        
        // Calculate average response time
        this.metrics.averageResponseTime = 
            this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length;
    }

    // Get current memory usage
    getMemoryUsage() {
        const usage = process.memoryUsage();
        return {
            rss: Math.round(usage.rss / 1024 / 1024), // MB
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
            external: Math.round(usage.external / 1024 / 1024) // MB
        };
    }

    // Calculate error rate
    getErrorRate() {
        if (this.metrics.commandsExecuted === 0) return 0;
        return this.metrics.errorsEncountered / this.metrics.commandsExecuted;
    }

    // Get uptime in readable format
    getUptime() {
        const uptimeMs = Date.now() - this.metrics.startTime;
        const days = Math.floor(uptimeMs / (24 * 60 * 60 * 1000));
        const hours = Math.floor((uptimeMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const minutes = Math.floor((uptimeMs % (60 * 60 * 1000)) / (60 * 1000));
        
        return `${days}d ${hours}h ${minutes}m`;
    }

    // Perform comprehensive health check
    async performHealthCheck() {
        try {
            const memoryUsage = this.getMemoryUsage();
            const errorRate = this.getErrorRate();
            const uptime = this.getUptime();
            
            // Store memory usage history
            this.metrics.memoryUsage.push({
                timestamp: Date.now(),
                ...memoryUsage
            });
            
            // Keep only last 24 hours of memory usage (assuming 5-minute intervals)
            if (this.metrics.memoryUsage.length > 288) {
                this.metrics.memoryUsage.shift();
            }
            
            // Check health thresholds
            const healthIssues = [];
            
            if (memoryUsage.heapUsed > this.thresholds.maxMemoryUsageMB) {
                healthIssues.push(`High memory usage: ${memoryUsage.heapUsed}MB`);
            }
            
            if (this.metrics.averageResponseTime > this.thresholds.maxResponseTimeMs) {
                healthIssues.push(`High response time: ${this.metrics.averageResponseTime.toFixed(2)}ms`);
            }
            
            if (errorRate > this.thresholds.maxErrorRate) {
                healthIssues.push(`High error rate: ${(errorRate * 100).toFixed(2)}%`);
            }
            
            // Update health status
            const wasHealthy = this.isHealthy;
            this.isHealthy = healthIssues.length === 0;
            
            // Log health status changes
            if (wasHealthy && !this.isHealthy) {
                await logger.warn('HEALTH_MONITOR', 'Bot health degraded', { issues: healthIssues });
            } else if (!wasHealthy && this.isHealthy) {
                await logger.system('HEALTH_MONITOR', 'Bot health recovered');
            }
            
            // Log periodic health report
            const healthData = {
                uptime,
                memoryUsage,
                commandsExecuted: this.metrics.commandsExecuted,
                errorRate: (errorRate * 100).toFixed(2) + '%',
                averageResponseTime: this.metrics.averageResponseTime.toFixed(2) + 'ms',
                isHealthy: this.isHealthy,
                issues: healthIssues
            };
            
            await logger.system('HEALTH_MONITOR', 'Health check completed', healthData);
            
        } catch (error) {
            await logger.error('HEALTH_MONITOR', 'Health check failed', error);
        }
    }

    // Get comprehensive system stats
    getSystemStats() {
        return {
            uptime: this.getUptime(),
            memoryUsage: this.getMemoryUsage(),
            commandsExecuted: this.metrics.commandsExecuted,
            errorsEncountered: this.metrics.errorsEncountered,
            errorRate: (this.getErrorRate() * 100).toFixed(2) + '%',
            averageResponseTime: this.metrics.averageResponseTime.toFixed(2) + 'ms',
            isHealthy: this.isHealthy,
            activeConnections: this.metrics.activeConnections
        };
    }

    // Manual health check trigger
    async triggerHealthCheck() {
        await this.performHealthCheck();
        return this.getSystemStats();
    }

    // Memory cleanup utility
    forceGarbageCollection() {
        if (global.gc) {
            global.gc();
            logger.system('HEALTH_MONITOR', 'Garbage collection forced');
        } else {
            logger.warn('HEALTH_MONITOR', 'Garbage collection not available (run with --expose-gc)');
        }
    }

    // Get performance recommendations
    getPerformanceRecommendations() {
        const recommendations = [];
        const memoryUsage = this.getMemoryUsage();
        const errorRate = this.getErrorRate();
        
        if (memoryUsage.heapUsed > 300) {
            recommendations.push({
                type: 'memory',
                message: 'Consider implementing memory optimization strategies',
                priority: 'high'
            });
        }
        
        if (this.metrics.averageResponseTime > 2000) {
            recommendations.push({
                type: 'performance',
                message: 'Response times are slow, consider optimizing database queries',
                priority: 'medium'
            });
        }
        
        if (errorRate > 0.02) {
            recommendations.push({
                type: 'reliability',
                message: 'Error rate is elevated, review error logs',
                priority: 'high'
            });
        }
        
        if (this.metrics.commandsExecuted > 10000 && this.metrics.responseTimes.length < 50) {
            recommendations.push({
                type: 'monitoring',
                message: 'Increase response time history for better analytics',
                priority: 'low'
            });
        }
        
        return recommendations;
    }
}

module.exports = new HealthMonitor(); 
