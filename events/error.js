const channelConfig = require('../config/channels');

module.exports = {
    name: 'error',
    execute(error, client) {
        console.error('An error occurred:', error);
        // Optionally, send this to a channel for the team to see
        const logChannel = client.channels.cache.get(channelConfig.getId('MODERATION_LOG'));
        if (logChannel) {
            logChannel.send(`An error occurred: ${error.message}`);
        }
    }
};
