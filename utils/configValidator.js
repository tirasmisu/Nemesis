const { handleCommandError } = require('./errorManager');

class ConfigValidator {
    constructor() {
        this.requiredEnvVars = [
            'TOKEN',
            'MONGO_URI',
            'CLIENT_ID', 
            'GUILD_ID'
        ];
    }

    async validate() {
        try {
            await this.validateEnvVars();
            await this.validateChannels();
            return true;
        } catch (error) {
            handleCommandError(null, error, 'config validation');
            throw error;
        }
    }

    async validateEnvVars() {
        const missingVars = this.requiredEnvVars.filter(varName => !process.env[varName]);
        
        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }
        
        return true;
    }

    async validateChannels() {
        try {
            const channels = require('../config/channels');
            return channels.validate();
        } catch (error) {
            console.warn('Channel validation skipped: ', error.message);
            return true;
        }
    }
}

// Export both the class instance and the validateConfig function
const validator = new ConfigValidator();

async function validateConfig() {
    return validator.validate();
}

module.exports = {
    validateConfig,
    validator
}; 
