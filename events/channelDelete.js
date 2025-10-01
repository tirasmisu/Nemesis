// events/channelDelete.js
const channelConfig = require('../config/channels');

module.exports = {
    name: 'channelDelete',
    async execute(channel) {
        try {
            const serverLogChannelId = channelConfig.getId('SERVER_LOG');
            const logChannel = channel.guild.channels.cache.get(serverLogChannelId);
            if (!logChannel) return;

            logChannel.send({
                content: `The channel called ${channel.name} has been deleted.`,
            });
        } catch (error) {
            console.error('[ChannelDelete] Error logging channel deletion:', error);
        }
    }
};
