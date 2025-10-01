const logger = require('./logger');
const healthMonitor = require('./healthMonitor');

class MemoryManager {
    constructor() {
        this.memoryThresholds = {
            warning: 300 * 1024 * 1024,    // 300MB
            critical: 400 * 1024 * 1024,   // 400MB
            emergency: 450 * 1024 * 1024   // 450MB
        };
        
        this.gcStats = {
            totalCollections: 0,
            lastCollection: null,
            memoryFreed: 0
        };
        
        this.monitoringInterval = null;
        this.isMonitoring = false;
        
        this.startMonitoring();
    }

    startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        
        // Check memory every 30 seconds
        this.monitoringInterval = setInterval(async () => {
            await this.checkMemoryUsage();
        }, 30000);
        
        logger.system('MEMORY_MANAGER', 'Memory monitoring started');
    }

    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        this.isMonitoring = false;
        logger.system('MEMORY_MANAGER', 'Memory monitoring stopped');
    }

    async checkMemoryUsage() {
        try {
            const usage = process.memoryUsage();
            const heapUsed = usage.heapUsed;
            
            // Log current memory usage
            await logger.info('MEMORY_MANAGER', 'Memory check', {
                heapUsed: `${Math.round(heapUsed / 1024 / 1024)}MB`,
                heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
                rss: `${Math.round(usage.rss / 1024 / 1024)}MB`
            });

            if (heapUsed > this.memoryThresholds.emergency) {
                await this.handleEmergencyMemory(heapUsed);
            } else if (heapUsed > this.memoryThresholds.critical) {
                await this.handleCriticalMemory(heapUsed);
            } else if (heapUsed > this.memoryThresholds.warning) {
                await this.handleWarningMemory(heapUsed);
            }

        } catch (error) {
            await logger.error('MEMORY_MANAGER', 'Error checking memory usage', error);
        }
    }

    async handleWarningMemory(heapUsed) {
        await logger.warn('MEMORY_MANAGER', `Memory usage approaching threshold: ${Math.round(heapUsed / 1024 / 1024)}MB`);
        
        // Clear any cached data that can be regenerated
        await this.clearNonEssentialCaches();
    }

    async handleCriticalMemory(heapUsed) {
        await logger.warn('MEMORY_MANAGER', `Critical memory usage detected: ${Math.round(heapUsed / 1024 / 1024)}MB - forcing garbage collection`);
        
        await this.forceGarbageCollection();
        await this.clearNonEssentialCaches();
    }

    async handleEmergencyMemory(heapUsed) {
        await logger.error('MEMORY_MANAGER', `Emergency memory usage: ${Math.round(heapUsed / 1024 / 1024)}MB - aggressive cleanup`, null, {
            action: 'emergency_cleanup'
        });
        
        // Aggressive cleanup
        await this.forceGarbageCollection();
        await this.clearNonEssentialCaches();
        await this.clearExpiredData();
        
        // Force another GC after cleanup
        setTimeout(async () => {
            await this.forceGarbageCollection();
        }, 1000);
    }

    async forceGarbageCollection() {
        const beforeUsage = process.memoryUsage().heapUsed;
        
        if (global.gc) {
            global.gc();
            
            const afterUsage = process.memoryUsage().heapUsed;
            const memoryFreed = beforeUsage - afterUsage;
            
            this.gcStats.totalCollections++;
            this.gcStats.lastCollection = new Date().toISOString();
            this.gcStats.memoryFreed += memoryFreed;
            
            await logger.system('MEMORY_MANAGER', 'Garbage collection completed', {
                memoryFreed: `${Math.round(memoryFreed / 1024 / 1024)}MB`,
                heapAfter: `${Math.round(afterUsage / 1024 / 1024)}MB`,
                totalCollections: this.gcStats.totalCollections
            });
            
            return memoryFreed;
        } else {
            await logger.warn('MEMORY_MANAGER', 'Garbage collection not available (run with --expose-gc)');
            return 0;
        }
    }

    async clearNonEssentialCaches() {
        try {
            // Clear any module-level caches that can be safely cleared
            const cacheCleared = {
                messageCache: 0,
                userCache: 0,
                tempData: 0
            };

            // Clear expired entries from various caches
            // This is a placeholder - specific cache clearing would be implemented based on actual cache systems
            
            await logger.system('MEMORY_MANAGER', 'Non-essential caches cleared', cacheCleared);
            
        } catch (error) {
            await logger.error('MEMORY_MANAGER', 'Error clearing caches', error);
        }
    }

    async clearExpiredData() {
        try {
            // Clear expired data from memory structures
            const currentTime = Date.now();
            let itemsCleared = 0;
            
            // This would clear expired items from maps, arrays, etc.
            // Implementation depends on specific data structures used
            
            await logger.system('MEMORY_MANAGER', 'Expired data cleared', {
                itemsCleared
            });
            
        } catch (error) {
            await logger.error('MEMORY_MANAGER', 'Error clearing expired data', error);
        }
    }

    getMemoryStats() {
        const usage = process.memoryUsage();
        return {
            current: {
                heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
                heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
                rss: Math.round(usage.rss / 1024 / 1024),
                external: Math.round(usage.external / 1024 / 1024)
            },
            thresholds: {
                warning: Math.round(this.memoryThresholds.warning / 1024 / 1024),
                critical: Math.round(this.memoryThresholds.critical / 1024 / 1024),
                emergency: Math.round(this.memoryThresholds.emergency / 1024 / 1024)
            },
            gcStats: this.gcStats
        };
    }

    // Manual memory cleanup for specific scenarios
    async manualCleanup(aggressive = false) {
        await logger.system('MEMORY_MANAGER', `Manual cleanup initiated - aggressive: ${aggressive}`);
        
        const beforeUsage = process.memoryUsage().heapUsed;
        
        await this.clearNonEssentialCaches();
        
        if (aggressive) {
            await this.clearExpiredData();
        }
        
        const memoryFreed = await this.forceGarbageCollection();
        
        const afterUsage = process.memoryUsage().heapUsed;
        const totalFreed = beforeUsage - afterUsage;
        
        await logger.system('MEMORY_MANAGER', 'Manual cleanup completed', {
            totalMemoryFreed: `${Math.round(totalFreed / 1024 / 1024)}MB`,
            aggressive
        });
        
        return totalFreed;
    }

    // Get memory usage percentage
    getMemoryUsagePercentage() {
        const usage = process.memoryUsage();
        const usedPercentage = (usage.heapUsed / usage.heapTotal) * 100;
        return Math.round(usedPercentage);
    }

    // Check if memory is in critical state
    isCriticalMemoryState() {
        const usage = process.memoryUsage();
        return usage.heapUsed > this.memoryThresholds.critical;
    }
}

module.exports = new MemoryManager(); 
