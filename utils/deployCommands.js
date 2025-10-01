const fs = require('fs');
const path = require('path');
const { REST } = require('discord.js');
const { Routes } = require('discord-api-types/v10');

// Command categories - expanded to include more commands
const COMMAND_CATEGORIES = {
    moderation: ['ban', 'unban', 'kick', 'warn', 'mute', 'unmute', 'purge', 'purgeuser', 'lock', 'unlock', 'blacklistword', 'unblacklistword', 'removepunishment', 'reasonedit'],
    utility: ['ping', 'userinfo', 'avatar', 'serverinfo', 'roleinfo', 'translate', 'nickname', 'updatecount', 'staffview', 'modview', 'staffguide'],
    admin: ['say', 'addrole', 'removerole', 'setnick', 'setupnickrequest'],
    tickets: ['ticket', 'closeticket', 'adduser', 'removeuser', 'setupticket', 'helpstaff'],
    fun: ['say', 'meme', 'gif']
};

// Required command properties - make only data and execute required
const REQUIRED_COMMAND_PROPERTIES = [
    'data',
    'execute'
];

async function loadCommands(commandsPath) {
    if (!fs.existsSync(commandsPath)) {
        console.error(`Commands directory not found at: ${commandsPath}`);
        process.exit(1);
    }

    const commandFiles = fs.readdirSync(commandsPath)
        .filter(file => file.endsWith('.js'));

    const commands = [];
    const errors = [];

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
            const command = require(filePath);
            
            // Validate command has minimal required properties
            if (!command.data || !command.execute) {
                errors.push(`Command ${file} is missing required data or execute method`);
                continue;
            }

            // Validate command data
            if (!('toJSON' in command.data)) {
                errors.push(`Command ${file} is missing required "toJSON" method`);
                continue;
            }

            // Add command to list - don't filter by category
            commands.push(command.data.toJSON());
            console.log(`Loaded command: ${command.data.name}`);
        } catch (error) {
            errors.push(`Error loading command from ${file}: ${error.message}\nRequire stack:\n${error.stack}`);
        }
    }

    // Log any errors
    if (errors.length > 0) {
        console.error('Command loading errors:');
        errors.forEach(error => console.error(`- ${error}`));
    }

    return commands;
}

async function deployCommandsToAPI(rest, commands, route) {
    try {
        // Make sure commands is an array, not a Promise
        if (commands && typeof commands.then === 'function') {
            commands = await commands; // Resolve promise if passed as a promise
        }
        
        if (!commands || !Array.isArray(commands)) {
            console.error('No commands to deploy or commands is not an array:', commands);
            return;
        }

        console.log(`Deploying ${commands.length} commands...`);
        
        // Validate commands before deployment
        const validCommands = commands.filter(cmd => {
            const isValid = cmd && cmd.name; // Context menu commands don't have a description
            if (!isValid) {
                console.warn(`Skipping invalid command: ${JSON.stringify(cmd)}`);
            }
            return isValid;
        });

        if (validCommands.length === 0) {
            throw new Error('No valid commands to deploy');
        }

        // Deploy commands
        await rest.put(route, { body: validCommands });
        console.log('Successfully deployed commands.');

        // Log deployment summary
        console.log('\nDeployment Summary:');
        console.log(`Total commands deployed: ${validCommands.length}`);
    } catch (error) {
        console.error('Failed to deploy commands:', error);
        throw error;
    }
}

/**
 * Main function to deploy commands
 * @param {Object} clientOrRest - Discord.js client or REST instance
 * @param {Array} [commandsArray] - Optional array of commands (when using REST mode)
 * @param {Object} [route] - Optional route object (when using REST mode)
 */
async function deployCommands(clientOrRest, commandsArray, route) {
    try {
        // List of guild commands to exclude from deployment
        const excludedGuildCommands = [
            'shutdowntira', 
            'setupticket', 
            'deleteglobalcommands'
        ];
        
        // If called with REST instance directly (from scripts)
        if (commandsArray && route) {
            // Filter out excluded commands
            const filteredCommands = commandsArray.filter(cmd => !excludedGuildCommands.includes(cmd.name));
            if (filteredCommands.length < commandsArray.length) {
                console.log(`Excluded ${commandsArray.length - filteredCommands.length} guild command(s) from deployment.`);
            }
            return await deployCommandsToAPI(clientOrRest, filteredCommands, route);
        }
        
        // Otherwise, assume it's called with a client (from the bot)
        const client = clientOrRest;
        const token = process.env.TOKEN;
        const clientId = process.env.CLIENT_ID;
        const guildId = process.env.GUILD_ID;
        
        if (!token || !clientId || !guildId) {
            throw new Error('Missing required environment variables: TOKEN, CLIENT_ID, or GUILD_ID');
        }
        
        // Create a new REST instance
        const rest = new REST({ version: '10' }).setToken(token);
        
        // Get the commands from the client's command collection
        const commands = [];
        const guildCommands = [];
        const contextMenus = [];
        
        // Load regular commands
        if (client.commands) {
            for (const command of client.commands.values()) {
                if (command.data && command.data.toJSON) {
                    commands.push(command.data.toJSON());
                }
            }
        }
        
        // Load guild-specific commands (excluding the ones we don't want)
        if (client.guildCommands) {
            for (const command of client.guildCommands.values()) {
                if (command.data && command.data.toJSON && !excludedGuildCommands.includes(command.data.name)) {
                    guildCommands.push(command.data.toJSON());
                } else if (excludedGuildCommands.includes(command.data.name)) {
                    console.log(`Excluded guild command from deployment: ${command.data.name}`);
                }
            }
        }
        
        // Load context menu commands from directory
        const contextMenusPath = path.join(__dirname, '..', 'contextMenus');
        if (fs.existsSync(contextMenusPath)) {
            const contextMenuFiles = fs.readdirSync(contextMenusPath).filter(file => file.endsWith('.js'));
            for (const file of contextMenuFiles) {
                try {
                    const contextMenu = require(path.join(contextMenusPath, file));
                    if (contextMenu.data && contextMenu.data.toJSON && contextMenu.execute) {
                        contextMenus.push(contextMenu.data.toJSON());
                        console.log(`Loaded context menu command: ${contextMenu.data.name}`);
                    }
                } catch (error) {
                    console.error(`Error loading context menu ${file}:`, error);
                }
            }
        }
        
        console.log(`Found ${commands.length} global commands, ${guildCommands.length} guild commands, and ${contextMenus.length} context menu commands to deploy.`);
        
        // Deploy commands to specific guild (development)
        const guildRoute = Routes.applicationGuildCommands(clientId, guildId);
        
        // Combine all commands for guild deployment
        const allGuildCommands = [...commands, ...guildCommands, ...contextMenus];
        
        // Deploy to guild first (faster for testing)
        await deployCommandsToAPI(rest, allGuildCommands, guildRoute);
        
        console.log('Command deployment complete.');
        return true;
    } catch (error) {
        console.error('Error in deployCommands:', error);
        throw error;
    }
}

// Export functions and constants
module.exports = {
    loadCommands,
    deployCommandsToAPI,
    deployCommands,
    COMMAND_CATEGORIES,
    REQUIRED_COMMAND_PROPERTIES
};
