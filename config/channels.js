// Channel configuration
class ChannelConfig {
    constructor() {
        this.channels = {
            MODERATION_LOG: {
                id: '1277788469711736842',
                name: 'mod-logs',
                type: 'text'
            },
            STAFF_LOGS: {
                id: '1394129868068880424',
                name: 'staff-logs',
                type: 'text'
            },
            TICKETS: {
                id: '1348834716148830229',
                name: 'tickets',
                type: 'text'
            },
            MEME_SOURCE: {
                id: '1006759712689225812',
                name: 'meme-source',
                type: 'text'
            },
            MEME_FORWARD: {
                id: '1369797932899111023',
                name: 'meme-forward',
                type: 'text'
            },
            MEMBER_LOG: {
                id: '1067150382079422554', // Add your member log channel ID here
                name: '📝」member-log',
                type: 'text'
            },
            DOOR_LOG: {
                id: '1067150653916467270', // Add your door log channel ID here
                name: '📝」door-log',
                type: 'text'
            },
            MESSAGE_LOG: {
                id: '1262460190201221210', // Add your message log channel ID here
                name: '📝」message-log',
                type: 'text'
            },
            SERVER_LOG: {
                id: '1369845799780880454', // Add your server log channel ID here
                name: '📝」server-log',
                type: 'text'
            },
            VC_LOG: {
                id: '1067150558512824370', // Add your voice channel log ID here
                name: '📝」vc-log',
                type: 'text'
            },
            TICKET_LOGS: {
                id: '1017581840242049086', // Add your ticket logs channel ID here
                name: '📝」ticket-logs',
                type: 'text'
            },
            NICKNAME_REQUESTS: {
                id: '1056242579798241310', // Add your nickname requests channel ID here
                name: '📝」nickname-requests',
                type: 'text'
            },
            TICKETS_CATEGORY: {
                id: '1017581763528241223', // Add your tickets category ID here
                name: 'tickets',
                type: 'text'
            },
            MEMES: {
                id: '1006759712689225812', // Add your memes channel ID here
                name: '🤡」memes',
                type: 'text'
            },
            MEDIA: {
                id: '1139749805254520923', // Add your media channel ID here
                name: '📷」media',
                type: 'text'
            },
            ARTWORK: {
                id: '1006759872798392360', // Add your artwork channel ID here
                name: '🎨」artwork',
                type: 'text'
            },
            MUSIC: {
                id: '1340118275409055804', // Add  your  music channel ID here
                name: 'music',
                type: 'text'
            },
            ADMIN_LOG: {
                id: '1370217602764509266', // Admin log channel ID
                name: 'admin-logs', 
                type: 'text'
            },
            BOT_COMMANDS: {
                id: '1054586052947484672', // Bot commands channel ID
                name: 'bot-commands',
                type: 'text'
            },
            BOT_ERROR_LOG: {
                id: '1393013875192102952', // Bot error logging channel ID
                name: 'bot-error-log',
                type: 'text'
            }
        };
    }

    get(channelName) {
        const channel = this.channels[channelName];
        if (!channel) {
            throw new Error(`Channel configuration not found: ${channelName}`);
        }
        return channel;
    }

    getId(channelName) {
        return this.get(channelName).id;
    }

    getName(channelName) {
        return this.get(channelName).name;
    }

    getType(channelName) {
        return this.get(channelName).type;
    }

    validate() {
        const requiredChannels = ['MODERATION_LOG', 'STAFF_LOGS', 'TICKETS', 'MUSIC'];
        for (const channel of requiredChannels) {
            if (!this.channels[channel]?.id) {
                throw new Error(`Missing required channel ID: ${channel}`);
            }
        }
        return true;
    }
}

module.exports = new ChannelConfig(); 
