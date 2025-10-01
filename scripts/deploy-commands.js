require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { REST, Routes, PermissionFlagsBits } = require('discord.js');
const { loadCommands, deployCommands } = require('../utils/deployCommands');

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

// Define which commands should be public vs staff-only
const PUBLIC_COMMANDS = [
  'ping',
  'help',
  'userinfo',
  'avatar',
  'rank',
  'leaderboard',
  'level',
  'invite',
  'nickname',
  'translate'
];

if (!token || !clientId || !guildId) {
    console.error('Missing required environment variables. Please check your .env file for TOKEN, CLIENT_ID, and GUILD_ID.');
    process.exit(1);
}

// Function to load context menu commands
async function loadContextMenuCommands(contextMenusPath) {
    if (!fs.existsSync(contextMenusPath)) {
        console.log(`Context menu directory not found at: ${contextMenusPath}`);
        return [];
    }

    const contextMenuFiles = fs.readdirSync(contextMenusPath).filter(file => file.endsWith('.js'));
    const contextMenus = [];

    for (const file of contextMenuFiles) {
        try {
            const filePath = path.join(contextMenusPath, file);
            const contextMenu = require(filePath);
            
            if (contextMenu.data && contextMenu.data.toJSON && contextMenu.execute) {
                // Set appropriate permissions for staff-only context menu commands
                const isPublic = PUBLIC_COMMANDS.includes(contextMenu.data.name.toLowerCase());
                if (!isPublic) {
                    contextMenu.data.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
                }
                
                contextMenus.push(contextMenu.data.toJSON());
                console.log(`Loaded context menu command: ${contextMenu.data.name}`);
            } else {
                console.warn(`Context menu ${file} is missing required properties`);
            }
        } catch (error) {
            console.error(`Error loading context menu ${file}:`, error);
        }
    }

    return contextMenus;
}

// Function to load commands with permissions
async function loadCommandsWithPermissions(commandsPath) {
    if (!fs.existsSync(commandsPath)) {
        console.error(`Commands directory not found at: ${commandsPath}`);
        process.exit(1);
    }

    const commandFiles = fs.readdirSync(commandsPath)
        .filter(file => file.endsWith('.js'));

    const commands = [];

    for (const file of commandFiles) {
        try {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            
            if (command.data && command.data.toJSON && command.execute) {
                // Set appropriate permissions for staff-only commands
                const isPublic = PUBLIC_COMMANDS.includes(command.data.name.toLowerCase());
                if (!isPublic) {
                    command.data.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
                }
                
                commands.push(command.data.toJSON());
                console.log(`Loaded command: ${command.data.name}`);
            } else {
                console.warn(`Command ${file} is missing required properties`);
            }
        } catch (error) {
            console.error(`Error loading command ${file}:`, error);
        }
    }

    return commands;
}

(async () => {
    try {
        // Load commands with permissions
        const commands = await loadCommandsWithPermissions(path.join(__dirname, '../commands'));
        
        // Load context menu commands
        const contextMenus = await loadContextMenuCommands(path.join(__dirname, '../contextMenus'));
        
        // Combine regular commands and context menu commands
        const allCommands = [...commands, ...contextMenus];
        
        // List of specific guild commands we want to exclude
        const excludedGuildCommands = [
            'shutdowntira', 
            'setupticket', 
            'deleteglobalcommands'
        ];
        
        // Filter out any commands that are in the excluded list
        const filteredCommands = allCommands.filter(cmd => !excludedGuildCommands.includes(cmd.name));
        
        const rest = new REST({ version: '10' }).setToken(token);

        // Only deploy to the specific guild, never globally
        console.log(`Deploying ${filteredCommands.length} commands to guild ${guildId}...`);
        console.log(`Excluded ${allCommands.length - filteredCommands.length} guild-specific commands`);
        
        // Use the guild-specific endpoint
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId), 
            { body: filteredCommands }
        );
        
        console.log('Successfully deployed guild commands!');

    } catch (error) {
        console.error('Error during command deployment:', error);
    }
})();
