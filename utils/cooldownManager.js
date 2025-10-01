const logger = require('./logger');

class CooldownManager {
    constructor() {
        this.cooldowns = new Map();
        this.defaultCooldowns = {
            // Moderation commands - longer cooldowns
            'ban': 5000,          // 5 seconds
            'kick': 3000,         // 3 seconds
            'mute': 3000,         // 3 seconds
            'warn': 2000,         // 2 seconds
            
            // Heavy commands - moderate cooldowns
            'status': 10000,      // 10 seconds (detailed system info)
            'analytics': 15000,   // 15 seconds (complex data)
            
            // Regular commands - minimal cooldowns
            'help': 1000,         // 1 second
            'ping': 500,          // 0.5 seconds
            'info': 1000,         // 1 second
            
            // Default for unlisted commands
            'default': 1000       // 1 second
        };
        
        this.globalCooldowns = new Map();
        this.stats = {
            totalCooldowns: 0,
            bypassedCooldowns: 0,
            averageCooldownTime: 0
        };
        
        // Cleanup expired cooldowns every 5 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredCooldowns();
        }, 5 * 60 * 1000);
        
        logger.system('COOLDOWN_MANAGER', 'Cooldown manager initialized');
    }

    /**
     * Set a cooldown for a user and command
     * @param {string} userId - Discord user ID
     * @param {string} commandName - Command name
     * @param {number} duration - Cooldown duration in milliseconds (optional)
     */
    setCooldown(userId, commandName, duration = null) {
        // Use command-specific cooldown or default
        const cooldownTime = duration || this.defaultCooldowns[commandName] || this.defaultCooldowns.default;
        
        const key = `${userId}_${commandName}`;
        const expiryTime = Date.now() + cooldownTime;
        
        this.cooldowns.set(key, expiryTime);
        this.stats.totalCooldowns++;
        
        // Auto cleanup when cooldown expires
        setTimeout(() => {
            this.cooldowns.delete(key);
        }, cooldownTime);
        
        logger.info('COOLDOWN_MANAGER', `Cooldown set for ${commandName}`, {
            userId,
            duration: cooldownTime,
            expiresAt: new Date(expiryTime).toISOString()
        });
    }

    /**
     * Check if user is on cooldown for a command
     * @param {string} userId - Discord user ID
     * @param {string} commandName - Command name
     * @returns {boolean} True if on cooldown
     */
    isOnCooldown(userId, commandName) {
        const key = `${userId}_${commandName}`;
        const expiry = this.cooldowns.get(key);
        
        if (!expiry) return false;
        
        const isOnCooldown = Date.now() < expiry;
        
        if (!isOnCooldown) {
            // Remove expired cooldown
            this.cooldowns.delete(key);
        }
        
        return isOnCooldown;
    }

    /**
     * Get remaining cooldown time
     * @param {string} userId - Discord user ID
     * @param {string} commandName - Command name
     * @returns {number} Remaining time in milliseconds, 0 if no cooldown
     */
    getRemainingCooldown(userId, commandName) {
        const key = `${userId}_${commandName}`;
        const expiry = this.cooldowns.get(key);
        
        if (!expiry) return 0;
        
        const remaining = expiry - Date.now();
        return remaining > 0 ? remaining : 0;
    }

    /**
     * Get formatted remaining cooldown time
     * @param {string} userId - Discord user ID
     * @param {string} commandName - Command name
     * @returns {string} Formatted time string
     */
    getFormattedCooldown(userId, commandName) {
        const remaining = this.getRemainingCooldown(userId, commandName);
        
        if (remaining === 0) return 'No cooldown';
        
        if (remaining < 1000) {
            return `${Math.ceil(remaining)}ms`;
        } else {
            return `${Math.ceil(remaining / 1000)}s`;
        }
    }

    /**
     * Bypass cooldown for specific users (staff, etc.)
     * @param {string} userId - Discord user ID
     * @param {string} commandName - Command name
     * @param {string} reason - Reason for bypass
     */
    bypassCooldown(userId, commandName, reason = 'Staff bypass') {
        const key = `${userId}_${commandName}`;
        
        if (this.cooldowns.has(key)) {
            this.cooldowns.delete(key);
            this.stats.bypassedCooldowns++;
            
            logger.system('COOLDOWN_MANAGER', `Cooldown bypassed for ${commandName}`, {
                userId,
                reason
            });
        }
    }

    /**
     * Set global cooldown (affects all users)
     * @param {string} commandName - Command name
     * @param {number} duration - Cooldown duration in milliseconds
     * @param {string} reason - Reason for global cooldown
     */
    setGlobalCooldown(commandName, duration, reason = 'System protection') {
        const expiryTime = Date.now() + duration;
        this.globalCooldowns.set(commandName, expiryTime);
        
        setTimeout(() => {
            this.globalCooldowns.delete(commandName);
        }, duration);
        
        logger.warn('COOLDOWN_MANAGER', `Global cooldown set for ${commandName}`, {
            duration,
            reason,
            expiresAt: new Date(expiryTime).toISOString()
        });
    }

    /**
     * Check if command has global cooldown
     * @param {string} commandName - Command name
     * @returns {boolean} True if globally on cooldown
     */
    isGlobalCooldown(commandName) {
        const expiry = this.globalCooldowns.get(commandName);
        
        if (!expiry) return false;
        
        const isOnCooldown = Date.now() < expiry;
        
        if (!isOnCooldown) {
            this.globalCooldowns.delete(commandName);
        }
        
        return isOnCooldown;
    }

    /**
     * Update default cooldown for a command
     * @param {string} commandName - Command name
     * @param {number} duration - New cooldown duration in milliseconds
     */
    updateDefaultCooldown(commandName, duration) {
        const oldDuration = this.defaultCooldowns[commandName] || this.defaultCooldowns.default;
        this.defaultCooldowns[commandName] = duration;
        
        logger.system('COOLDOWN_MANAGER', `Updated default cooldown for ${commandName}`, {
            oldDuration,
            newDuration: duration
        });
    }

    /**
     * Get all active cooldowns for a user
     * @param {string} userId - Discord user ID
     * @returns {Array} Array of active cooldowns
     */
    getUserCooldowns(userId) {
        const userCooldowns = [];
        
        for (const [key, expiry] of this.cooldowns.entries()) {
            if (key.startsWith(userId + '_')) {
                const commandName = key.split('_')[1];
                const remaining = expiry - Date.now();
                
                if (remaining > 0) {
                    userCooldowns.push({
                        command: commandName,
                        remaining,
                        formattedRemaining: this.formatDuration(remaining),
                        expiresAt: new Date(expiry).toISOString()
                    });
                }
            }
        }
        
        return userCooldowns.sort((a, b) => b.remaining - a.remaining);
    }

    /**
     * Clean up expired cooldowns to prevent memory leaks
     */
    cleanupExpiredCooldowns() {
        const currentTime = Date.now();
        let cleanedCount = 0;
        
        for (const [key, expiry] of this.cooldowns.entries()) {
            if (currentTime >= expiry) {
                this.cooldowns.delete(key);
                cleanedCount++;
            }
        }
        
        // Clean up global cooldowns too
        for (const [command, expiry] of this.globalCooldowns.entries()) {
            if (currentTime >= expiry) {
                this.globalCooldowns.delete(command);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            logger.system('COOLDOWN_MANAGER', `Cleaned up ${cleanedCount} expired cooldowns`);
        }
    }

    /**
     * Get cooldown statistics
     * @returns {Object} Cooldown statistics
     */
    getStats() {
        return {
            activeCooldowns: this.cooldowns.size,
            globalCooldowns: this.globalCooldowns.size,
            totalCooldowns: this.stats.totalCooldowns,
            bypassedCooldowns: this.stats.bypassedCooldowns,
            defaultCooldowns: Object.keys(this.defaultCooldowns).length
        };
    }

    /**
     * Get detailed cooldown information
     * @returns {Object} Detailed cooldown data
     */
    getDetailedInfo() {
        const stats = this.getStats();
        const activeCooldowns = [];
        
        for (const [key, expiry] of this.cooldowns.entries()) {
            const [userId, commandName] = key.split('_');
            const remaining = expiry - Date.now();
            
            if (remaining > 0) {
                activeCooldowns.push({
                    userId,
                    command: commandName,
                    remaining: this.formatDuration(remaining),
                    expiresAt: new Date(expiry).toISOString()
                });
            }
        }
        
        return {
            stats,
            activeCooldowns: activeCooldowns.slice(0, 10), // Show top 10
            globalCooldowns: Array.from(this.globalCooldowns.entries()).map(([command, expiry]) => ({
                command,
                remaining: this.formatDuration(expiry - Date.now()),
                expiresAt: new Date(expiry).toISOString()
            })),
            defaultCooldowns: this.defaultCooldowns
        };
    }

    /**
     * Format duration in a human-readable way
     * @param {number} milliseconds - Duration in milliseconds
     * @returns {string} Formatted duration
     */
    formatDuration(milliseconds) {
        if (milliseconds < 1000) {
            return `${Math.ceil(milliseconds)}ms`;
        } else if (milliseconds < 60000) {
            return `${Math.ceil(milliseconds / 1000)}s`;
        } else {
            const minutes = Math.floor(milliseconds / 60000);
            const seconds = Math.ceil((milliseconds % 60000) / 1000);
            return `${minutes}m ${seconds}s`;
        }
    }

    /**
     * Reset all cooldowns (emergency use)
     * @param {string} reason - Reason for reset
     */
    resetAllCooldowns(reason = 'Emergency reset') {
        const activeCount = this.cooldowns.size;
        const globalCount = this.globalCooldowns.size;
        
        this.cooldowns.clear();
        this.globalCooldowns.clear();
        
        logger.warn('COOLDOWN_MANAGER', 'All cooldowns reset', {
            reason,
            clearedActive: activeCount,
            clearedGlobal: globalCount
        });
    }

    /**
     * Destroy the cooldown manager
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        this.cooldowns.clear();
        this.globalCooldowns.clear();
        
        logger.system('COOLDOWN_MANAGER', 'Cooldown manager destroyed');
    }
}

module.exports = new CooldownManager(); 
