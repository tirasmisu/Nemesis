// events/roleCreate.js
module.exports = {
    name: 'roleCreate',
    async execute(role) {
        const logChannel = role.guild.channels.cache.find(channel => channel.name === '📝」server-log');
        if (!logChannel) return;

        logChannel.send({
            content: `A new role called ${role.name} has been created.`,
        });
    }
};
