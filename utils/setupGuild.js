// utils/setupGuild.js

/**
 * Sets up the guild when the bot joins.
 * @param {Guild} guild - The guild object provided by discord.js.
 */
module.exports = async (guild) => {
    try {
        console.log(`Setting up guild: ${guild.name} (${guild.id})`);

        // Check if a "general" text channel exists
        let generalChannel = guild.channels.cache.find(
            (channel) =>
                channel.name === 'general' && channel.type === 'GUILD_TEXT'
        );

        // If not, create one
        if (!generalChannel) {
            generalChannel = await guild.channels.create({
                name: 'general',
                type: 'GUILD_TEXT',
                reason: 'Default channel for new guild setup',
            });
            console.log(`Created default channel: ${generalChannel.name}`);
        } else {
            console.log(`Default channel already exists: ${generalChannel.name}`);
        }

        // Additional setup actions can be added here:
        // e.g., creating default roles, storing configuration in a database, etc.

    } catch (error) {
        console.error('Error in setupGuild:', error);
    }
};
