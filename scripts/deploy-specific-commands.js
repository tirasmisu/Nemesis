require('dotenv').config();
const path = require('path');
const { REST, Routes } = require('discord.js');
const { loadCommands, deployCommands } = require('../utils/deployCommands');

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
    console.error('Bot token, client ID, or guild ID is missing in the .env file!');
    process.exit(1);
}

const commands = loadCommands(path.join(__dirname, '../guildCommands'));

const rest = new REST({ version: '10' }).setToken(token);
const route = Routes.applicationGuildCommands(clientId, guildId); // Correct method name

(async () => {
    await deployCommands(rest, commands, route); // Awaiting the promise to handle it correctly
})();
