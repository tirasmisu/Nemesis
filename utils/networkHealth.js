const https = require('https');
const logger = require('./logger');

class NetworkHealthMonitor {
    constructor() {
        this.lastCheck = 0;
        this.checkInterval = 60000; // Check every minute
        this.discordEndpoints = [
            'https://discord.com/api/v10/gateway',
            'https://discord.com/api/v10/users/@me'
        ];
    }

    async checkDiscordConnectivity() {
        const now = Date.now();
        if (now - this.lastCheck < this.checkInterval) {
            return true; // Skip if checked recently
        }

        this.lastCheck = now;
        
        for (const endpoint of this.discordEndpoints) {
            try {
                const isReachable = await this.pingEndpoint(endpoint);
                if (!isReachable) {
                    if (logger && logger.warn) {
                        await logger.warn('NETWORK', `Discord endpoint ${endpoint} is not reachable`);
                    } else {
                        console.warn(`[NETWORK] ⚠️ Discord endpoint ${endpoint} is not reachable`);
                    }
                    return false;
                }
            } catch (error) {
                if (logger && logger.error) {
                    await logger.error('NETWORK', `Error checking ${endpoint}`, error);
                } else {
                    console.error(`[NETWORK] ❌ Error checking ${endpoint}:`, error);
                }
                return false;
            }
        }
        
        if (logger && logger.system) {
            await logger.system('NETWORK', 'All Discord endpoints are reachable');
        } else {
            console.log(`[NETWORK] 📊 All Discord endpoints are reachable`);
        }
        return true;
    }

    async pingEndpoint(url) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve(false);
            }, 10000);

            https.get(url, (res) => {
                clearTimeout(timeout);
                resolve(res.statusCode < 500);
            }).on('error', () => {
                clearTimeout(timeout);
                resolve(false);
            });
        });
    }

    async getNetworkInfo() {
        const info = {
            timestamp: new Date().toISOString(),
            discordReachable: await this.checkDiscordConnectivity(),
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime()
        };

        return info;
    }
}

module.exports = new NetworkHealthMonitor(); 