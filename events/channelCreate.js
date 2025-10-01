// events/channelCreate.js
const channelConfig = require('../config/channels');

module.exports = {
    name: 'channelCreate',
    async execute(channel) {
        try {
            const serverLogChannelId = channelConfig.getId('SERVER_LOG');
            const logChannel = channel.guild.channels.cache.get(serverLogChannelId);
            if (!logChannel) return;

            logChannel.send({
                content: `A new channel called ${channel.name} has been created.`,
            });
        } catch (error) {
            console.error('[ChannelCreate] Error logging channel creation:', error);
        }
    }
};
