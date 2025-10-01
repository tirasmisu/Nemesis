const logger = require('./logger');

class DatabaseOptimizer {
    constructor() {
        this.queryStats = new Map();
        this.slowQueries = [];
        this.db = null;
        
        this.thresholds = {
            slowQueryMs: 500,
            maxSlowQueries: 50
        };
        
        logger.system('DB_OPTIMIZER', 'Database optimizer initialized');
    }

    configureDatabase(mongoClient, dbName) {
        try {
            this.db = mongoClient.db(dbName);
            this.createOptimizedIndexes();
            
            logger.system('DB_OPTIMIZER', 'Database configured with optimizations');
        } catch (error) {
            logger.error('DB_OPTIMIZER', 'Failed to configure database', error);
        }
    }

    async createOptimizedIndexes() {
        try {
            const collections = [
                {
                    name: 'users',
                    indexes: [
                        { userId: 1, guildId: 1 },
                        { guildId: 1, userId: 1 }
                    ]
                },
                {
                    name: 'xp',
                    indexes: [
                        { userId: 1, guildId: 1 },
                        { guildId: 1, xp: -1 },
                        { guildId: 1, level: -1 }
                    ]
                },
                {
                    name: 'modlogs',
                    indexes: [
                        { guildId: 1, timestamp: -1 },
                        { targetId: 1, guildId: 1 }
                    ]
                },
                {
                    name: 'mutes',
                    indexes: [
                        { userId: 1, guildId: 1 },
                        { expiresAt: 1 }
                    ]
                }
            ];
            
            for (const { name, indexes } of collections) {
                const collection = this.db.collection(name);
                
                for (const index of indexes) {
                    try {
                        await collection.createIndex(index, { background: true });
                        logger.system('DB_OPTIMIZER', `Index created for ${name}`, { index });
                    } catch (error) {
                        if (!error.message.includes('already exists')) {
                            logger.warn('DB_OPTIMIZER', `Failed to create index for ${name}`, { index });
                        }
                    }
                }
            }
            
        } catch (error) {
            logger.error('DB_OPTIMIZER', 'Failed to create optimized indexes', error);
        }
    }

    async executeOptimizedQuery(collection, query, options = {}, operation = 'find') {
        const startTime = performance.now();
        const queryKey = this.generateQueryKey(collection, query, operation);
        
        try {
            const coll = this.db.collection(collection);
            let result;
            
            switch (operation) {
                case 'find':
                    result = await coll.find(query, options).toArray();
                    break;
                case 'findOne':
                    result = await coll.findOne(query, options);
                    break;
                case 'insertOne':
                    result = await coll.insertOne(query, options);
                    break;
                case 'updateOne':
                    result = await coll.updateOne(query.filter, query.update, options);
                    break;
                case 'deleteOne':
                    result = await coll.deleteOne(query, options);
                    break;
                case 'countDocuments':
                    result = await coll.countDocuments(query, options);
                    break;
                default:
                    throw new Error(`Unsupported operation: ${operation}`);
            }
            
            const duration = performance.now() - startTime;
            this.trackQueryPerformance(queryKey, duration, true, collection, operation);
            
            return result;
            
        } catch (error) {
            const duration = performance.now() - startTime;
            this.trackQueryPerformance(queryKey, duration, false, collection, operation);
            
            logger.error('DB_OPTIMIZER', 'Query execution failed', error, {
                collection,
                operation,
                duration: Math.round(duration)
            });
            
            throw error;
        }
    }

    trackQueryPerformance(queryKey, duration, success, collection, operation) {
        const stats = this.queryStats.get(queryKey) || {
            count: 0,
            totalDuration: 0,
            averageDuration: 0,
            failures: 0,
            collection,
            operation,
            lastExecuted: null
        };
        
        stats.count++;
        stats.totalDuration += duration;
        stats.averageDuration = stats.totalDuration / stats.count;
        stats.lastExecuted = new Date().toISOString();
        
        if (!success) stats.failures++;
        
        this.queryStats.set(queryKey, stats);
        
        if (duration > this.thresholds.slowQueryMs) {
            this.trackSlowQuery(queryKey, duration, collection, operation);
        }
    }

    trackSlowQuery(queryKey, duration, collection, operation) {
        const slowQuery = {
            queryKey,
            duration: Math.round(duration),
            collection,
            operation,
            timestamp: new Date().toISOString()
        };
        
        this.slowQueries.push(slowQuery);
        
        if (this.slowQueries.length > this.thresholds.maxSlowQueries) {
            this.slowQueries = this.slowQueries.slice(-this.thresholds.maxSlowQueries);
        }
        
        logger.warn('DB_OPTIMIZER', 'Slow query detected', slowQuery);
    }

    generateQueryKey(collection, query, operation) {
        const queryStructure = this.simplifyQueryStructure(query);
        return `${collection}:${operation}:${JSON.stringify(queryStructure)}`;
    }

    simplifyQueryStructure(query) {
        if (typeof query !== 'object' || query === null) {
            return 'simple';
        }
        
        const simplified = {};
        for (const [key, value] of Object.entries(query)) {
            if (key === 'filter' || key === 'update') {
                simplified[key] = this.simplifyQueryStructure(value);
            } else if (typeof value === 'object') {
                simplified[key] = 'object';
            } else {
                simplified[key] = typeof value;
            }
        }
        
        return simplified;
    }

    getPerformanceStats() {
        const stats = Array.from(this.queryStats.values());
        
        return {
            totalQueries: stats.reduce((sum, stat) => sum + stat.count, 0),
            totalFailures: stats.reduce((sum, stat) => sum + stat.failures, 0),
            averageQueryTime: stats.length > 0 ? 
                stats.reduce((sum, stat) => sum + stat.averageDuration, 0) / stats.length : 0,
            slowQueriesCount: this.slowQueries.length,
            uniqueQueryTypes: stats.length,
            topSlowQueries: this.getTopSlowQueries(5),
            mostUsedQueries: this.getMostUsedQueries(5)
        };
    }

    getTopSlowQueries(limit = 10) {
        return this.slowQueries
            .sort((a, b) => b.duration - a.duration)
            .slice(0, limit);
    }

    getMostUsedQueries(limit = 10) {
        return Array.from(this.queryStats.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, limit)
            .map(stat => ({
                collection: stat.collection,
                operation: stat.operation,
                count: stat.count,
                averageDuration: Math.round(stat.averageDuration)
            }));
    }

    generateRecommendations() {
        const recommendations = [];
        const stats = this.getPerformanceStats();
        
        if (stats.slowQueriesCount > 10) {
            recommendations.push({
                type: 'performance',
                priority: 'high',
                message: `${stats.slowQueriesCount} slow queries detected. Consider adding indexes.`
            });
        }
        
        const failureRate = stats.totalQueries > 0 ? (stats.totalFailures / stats.totalQueries) * 100 : 0;
        if (failureRate > 5) {
            recommendations.push({
                type: 'reliability',
                priority: 'high',
                message: `High query failure rate: ${failureRate.toFixed(1)}%.`
            });
        }
        
        if (stats.averageQueryTime > 200) {
            recommendations.push({
                type: 'performance',
                priority: 'medium',
                message: `Average query time is ${Math.round(stats.averageQueryTime)}ms. Consider optimization.`
            });
        }
        
        return recommendations;
    }

    destroy() {
        this.queryStats.clear();
        this.slowQueries = [];
        logger.system('DB_OPTIMIZER', 'Database optimizer destroyed');
    }
}

module.exports = new DatabaseOptimizer(); 
