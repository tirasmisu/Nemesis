// events/roleDelete.js
module.exports = {
    name: 'roleDelete',
    async execute(role) {
        const logChannel = role.guild.channels.cache.find(channel => channel.name === '📝」server-log');
        if (!logChannel) return;

        logChannel.send({
            content: `The role called ${role.name} has been deleted.`,
        });
    }
};
