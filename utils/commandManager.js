const fsPromises = require('fs/promises');
const fs = require('fs'); // Regular fs for sync methods
const path = require('path');
const { Collection } = require('discord.js');
const { handleCommandError } = require('./errorHandler');
const {
    initializeCommandUsage,
    updateCommandUsage,
    getCommandSuggestions
} = require('./commandSuggestions');
const {
    isOnCooldown,
    setCooldown,
    getCooldownTime
} = require('./permissionManager');

class CommandManager {
    constructor() {
        this.commands = new Collection();
        initializeCommandUsage();
    }

    async loadCommands(client) {
        client.commands = this.commands;
        const commandsPath = path.join(__dirname, '..', 'commands');
        try {
            const files = await fsPromises.readdir(commandsPath);
            for (const file of files) {
                if (!file.endsWith('.js')) continue;
                try {
                    const command = require(path.join(commandsPath, file));
                    
                    if (this.isValidCommand(command)) {
                        this.commands.set(command.data.name, command);
                        client.commands.set(command.data.name, command);
                        console.log(`Loaded command: ${command.data.name}`);
                    } else {
                        console.warn(`Command ${file} is missing required properties.`);
                    }
                } catch (err) {
                    console.error(`Error loading command ${file}:`, err);
                }
            }
            
            const guildCommandsPath = path.join(__dirname, '..', 'guildCommands');
            
            // Use try-catch for existsSync to handle any potential errors
            let guildCommandsExist = false;
            try {
                guildCommandsExist = fs.existsSync(guildCommandsPath);
            } catch (fsError) {
                console.error('Error checking guildCommands directory:', fsError);
                guildCommandsExist = false;
            }
            
            if (guildCommandsExist) {
                try {
                    const guildFiles = await fsPromises.readdir(guildCommandsPath);
                    for (const file of guildFiles) {
                        if (!file.endsWith('.js')) continue;
                        try {
                            const command = require(path.join(guildCommandsPath, file));
                            
                            if (this.isValidCommand(command)) {
                                client.guildCommands.set(command.data.name, command);
                                console.log(`Loaded guild command: ${command.data.name}`);
                            } else {
                                console.warn(`Guild command ${file} is missing required properties.`);
                            }
                        } catch (err) {
                            console.error(`Error loading guild command ${file}:`, err);
                        }
                    }
                } catch (guildReadError) {
                    console.error('Error reading guildCommands directory:', guildReadError);
                }
            }
        } catch (err) {
            console.error('Failed to load commands:', err);
            throw err;
        }
    }
    
    isValidCommand(command) {
        if (command && command.data && typeof command.execute === 'function') {
            return true;
        }
        
        return false;
    }

    async handleCommand(interaction) {
        const commandName = interaction.commandName;
        const command = this.commands.get(commandName) || interaction.client.guildCommands?.get(commandName);
        
        if (!command) {
            const suggestions = getCommandSuggestions(commandName);
            if (suggestions.length) {
                return interaction.reply({
                    content: `Command not found. Did you mean: ${suggestions.map(cmd => `/${cmd}`).join(', ')}?`,
                    flags: ['Ephemeral']
                });
            }
            return;
        }
        
        try {
            if (isOnCooldown(interaction.user.id, commandName)) {
                const timeLeft = getCooldownTime(interaction.user.id, commandName);
                return interaction.reply({
                    content: `Please wait ${Math.ceil(timeLeft / 1000)} more second(s) before using /${commandName}.`,
                    flags: ['Ephemeral']
                });
            }
            
            setCooldown(interaction.user.id, commandName);
            updateCommandUsage(commandName);
            
            console.log(`${interaction.user.tag} used command: ${commandName}`);
            
            await command.execute(interaction);
        } catch (error) {
            await handleCommandError(interaction, error, `command: ${commandName}`);
        }
    }
}

module.exports = new CommandManager(); 
