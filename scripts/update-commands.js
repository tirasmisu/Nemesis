require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { REST, Routes } = require('discord.js');

// Load environment variables
const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
    console.error('Missing required environment variables. Please check your .env file for TOKEN, CLIENT_ID, and GUILD_ID.');
    process.exit(1);
}

async function main() {
    try {
        // Load commands
        console.log('Loading commands...');
        const commandsPath = path.join(__dirname, '../commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

        const commandsToUpdate = [];

        // Load each command
        for (const file of commandFiles) {
            try {
                const filePath = path.join(commandsPath, file);
                const command = require(filePath);
                
                if (command.data && command.data.toJSON) {
                    // Only add name, description, and options - preserving permissions
                    const commandData = command.data.toJSON();
                    const updateData = {
                        name: commandData.name,
                        description: commandData.description,
                        options: commandData.options || [],
                        type: commandData.type
                    };
                    
                    commandsToUpdate.push(updateData);
                    console.log(`Loaded command: ${commandData.name}`);
                } else {
                    console.warn(`Command ${file} is missing required properties`);
                }
            } catch (error) {
                console.error(`Error loading command ${file}:`, error);
            }
        }

        // Load context menu commands
        console.log('Loading context menu commands...');
        const contextMenusPath = path.join(__dirname, '../contextMenus');
        
        if (fs.existsSync(contextMenusPath)) {
            const contextMenuFiles = fs.readdirSync(contextMenusPath).filter(file => file.endsWith('.js'));
            
            for (const file of contextMenuFiles) {
                try {
                    const filePath = path.join(contextMenusPath, file);
                    const contextMenu = require(filePath);
                    
                    if (contextMenu.data && contextMenu.data.toJSON) {
                        // Only add name and type - preserving permissions
                        const menuData = contextMenu.data.toJSON();
                        const updateData = {
                            name: menuData.name,
                            type: menuData.type
                        };
                        
                        commandsToUpdate.push(updateData);
                        console.log(`Loaded context menu command: ${menuData.name}`);
                    } else {
                        console.warn(`Context menu ${file} is missing required properties`);
                    }
                } catch (error) {
                    console.error(`Error loading context menu ${file}:`, error);
                }
            }
        }

        // Initialize REST API client
        const rest = new REST({ version: '10' }).setToken(token);
        
        // Get existing commands to merge them properly
        console.log('Fetching existing commands...');
        const existingCommands = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
        console.log(`Found ${existingCommands.length} existing commands.`);
        
        // Update commands individually instead of bulk update
        console.log('Updating commands...');
        
        for (const commandData of commandsToUpdate) {
            // Find existing command with same name
            const existingCommand = existingCommands.find(cmd => cmd.name === commandData.name);
            
            if (existingCommand) {
                console.log(`Updating existing command: ${commandData.name}`);
                
                try {
                    // Update command definition while preserving permissions
                    await rest.patch(
                        Routes.applicationGuildCommand(clientId, guildId, existingCommand.id),
                        { body: commandData }
                    );
                    console.log(`Successfully updated command: ${commandData.name}`);
                } catch (error) {
                    console.error(`Error updating command ${commandData.name}:`, error);
                }
            } else {
                console.log(`Creating new command: ${commandData.name}`);
                
                try {
                    // Create new command
                    await rest.post(
                        Routes.applicationGuildCommands(clientId, guildId),
                        { body: commandData }
                    );
                    console.log(`Successfully created command: ${commandData.name}`);
                } catch (error) {
                    console.error(`Error creating command ${commandData.name}:`, error);
                }
            }
            
            // Add a small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        console.log('Commands updated successfully! Permission settings have been preserved.');
        
    } catch (error) {
        console.error('Error during command update:', error);
    }
}

main(); 
