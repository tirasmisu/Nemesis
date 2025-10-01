const fs = require('fs');
const path = require('path');
const { REST } = require('discord.js');
const { Routes } = require('discord-api-types/v10');

/**
 * Automated Command Deployment System
 * Syncs commands automatically when bot starts - adds new ones, removes old ones
 */
class AutoDeployCommands {
    constructor(client) {
        this.client = client;
        this.rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
        this.clientId = process.env.CLIENT_ID;
        this.guildId = process.env.GUILD_ID;
        
        // Commands to exclude from deployment
        this.excludedCommands = [
            'shutdowntira', 
            'setupticket', 
            'deleteglobalcommands'
        ];
    }

    /**
     * Load all commands from directories
     */
    async loadCommands() {
        const commands = [];
        const contextMenus = [];
        const guildCommands = [];

        // Load regular commands
        const commandsPath = path.join(__dirname, '..', 'commands');
        if (fs.existsSync(commandsPath)) {
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
            
            for (const file of commandFiles) {
                try {
                    const filePath = path.join(commandsPath, file);
                    delete require.cache[require.resolve(filePath)]; // Clear cache
                    const command = require(filePath);
                    
                    if (command.data && command.execute) {
                        if (!this.excludedCommands.includes(command.data.name)) {
                            commands.push(command.data.toJSON());
                            console.log(`✅ Loaded command: ${command.data.name}`);
                        } else {
                            console.log(`⏭️ Excluded command: ${command.data.name}`);
                        }
                    }
                } catch (error) {
                    console.error(`❌ Error loading command ${file}:`, error.message);
                }
            }
        }

        // Load context menu commands
        const contextMenusPath = path.join(__dirname, '..', 'contextMenus');
        if (fs.existsSync(contextMenusPath)) {
            const contextMenuFiles = fs.readdirSync(contextMenusPath).filter(file => file.endsWith('.js'));
            
            for (const file of contextMenuFiles) {
                try {
                    const filePath = path.join(contextMenusPath, file);
                    delete require.cache[require.resolve(filePath)]; // Clear cache
                    const contextMenu = require(filePath);
                    
                    if (contextMenu.data && contextMenu.execute) {
                        contextMenus.push(contextMenu.data.toJSON());
                        console.log(`✅ Loaded context menu: ${contextMenu.data.name}`);
                    }
                } catch (error) {
                    console.error(`❌ Error loading context menu ${file}:`, error.message);
                }
            }
        }

        // Load guild commands
        const guildCommandsPath = path.join(__dirname, '..', 'guildCommands');
        if (fs.existsSync(guildCommandsPath)) {
            const guildCommandFiles = fs.readdirSync(guildCommandsPath).filter(file => file.endsWith('.js'));
            
            for (const file of guildCommandFiles) {
                try {
                    const filePath = path.join(guildCommandsPath, file);
                    delete require.cache[require.resolve(filePath)]; // Clear cache
                    const guildCommand = require(filePath);
                    
                    if (guildCommand.data && guildCommand.execute) {
                        if (!this.excludedCommands.includes(guildCommand.data.name)) {
                            guildCommands.push(guildCommand.data.toJSON());
                            console.log(`✅ Loaded guild command: ${guildCommand.data.name}`);
                        } else {
                            console.log(`⏭️ Excluded guild command: ${guildCommand.data.name}`);
                        }
                    }
                } catch (error) {
                    console.error(`❌ Error loading guild command ${file}:`, error.message);
                }
            }
        }

        return {
            commands: [...commands, ...guildCommands],
            contextMenus,
            total: commands.length + contextMenus.length + guildCommands.length
        };
    }

    /**
     * Get currently deployed commands from Discord
     */
    async getCurrentlyDeployedCommands() {
        try {
            const guildRoute = Routes.applicationGuildCommands(this.clientId, this.guildId);
            const deployed = await this.rest.get(guildRoute);
            return deployed || [];
        } catch (error) {
            console.error('❌ Error fetching currently deployed commands:', error.message);
            return [];
        }
    }

    /**
     * Compare and sync commands
     */
    async syncCommands() {
        console.log('\n🔄 Starting automated command synchronization...');
        
        try {
            // Load commands from files
            const { commands, contextMenus, total } = await this.loadCommands();
            const allCommands = [...commands, ...contextMenus];
            
            // Get currently deployed commands
            const deployedCommands = await this.getCurrentlyDeployedCommands();
            
            console.log(`📁 Found ${total} local commands`);
            console.log(`🌐 Found ${deployedCommands.length} deployed commands`);
            
            // Create maps for easier comparison
            const localCommandMap = new Map();
            const deployedCommandMap = new Map();
            
            allCommands.forEach(cmd => {
                localCommandMap.set(cmd.name, cmd);
            });
            
            deployedCommands.forEach(cmd => {
                deployedCommandMap.set(cmd.name, cmd);
            });
            
            // Find differences
            const toAdd = [];
            const toUpdate = [];
            const toRemove = [];
            
            // Check for new or updated commands
            for (const [name, localCmd] of localCommandMap) {
                const deployedCmd = deployedCommandMap.get(name);
                
                if (!deployedCmd) {
                    toAdd.push(localCmd);
                } else {
                    // Simple comparison - if description or options changed
                    if (JSON.stringify(localCmd) !== JSON.stringify({
                        name: deployedCmd.name,
                        description: deployedCmd.description,
                        options: deployedCmd.options || [],
                        type: deployedCmd.type
                    })) {
                        toUpdate.push(localCmd);
                    }
                }
            }
            
            // Check for commands to remove (deployed but not in local files)
            for (const [name, deployedCmd] of deployedCommandMap) {
                if (!localCommandMap.has(name) && !this.excludedCommands.includes(name)) {
                    toRemove.push(deployedCmd);
                }
            }
            
            // Report changes
            if (toAdd.length > 0) {
                console.log(`➕ Adding ${toAdd.length} new commands:`, toAdd.map(cmd => cmd.name));
            }
            if (toUpdate.length > 0) {
                console.log(`🔄 Updating ${toUpdate.length} commands:`, toUpdate.map(cmd => cmd.name));
            }
            if (toRemove.length > 0) {
                console.log(`➖ Removing ${toRemove.length} old commands:`, toRemove.map(cmd => cmd.name));
            }
            
            // If no changes needed
            if (toAdd.length === 0 && toUpdate.length === 0 && toRemove.length === 0) {
                console.log('✅ Commands are already up to date! No changes needed.');
                return { success: true, changes: 0 };
            }
            
            // Deploy all commands (this replaces the entire command set)
            const guildRoute = Routes.applicationGuildCommands(this.clientId, this.guildId);
            await this.rest.put(guildRoute, { body: allCommands });
            
            const totalChanges = toAdd.length + toUpdate.length + toRemove.length;
            console.log(`✅ Successfully synchronized ${totalChanges} command changes!`);
            console.log(`📊 Final count: ${allCommands.length} commands deployed`);
            
            return {
                success: true,
                changes: totalChanges,
                added: toAdd.length,
                updated: toUpdate.length,
                removed: toRemove.length,
                total: allCommands.length
            };
            
        } catch (error) {
            console.error('❌ Error during command synchronization:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Deploy commands with detailed logging
     */
    async deploy() {
        if (!this.clientId || !this.guildId) {
            console.error('❌ Missing CLIENT_ID or GUILD_ID environment variables');
            return false;
        }
        
        console.log('\n🚀 Automated Command Deployment Starting...');
        console.log(`🎯 Target Guild: ${this.guildId}`);
        console.log(`🤖 Client ID: ${this.clientId}`);
        
        const result = await this.syncCommands();
        
        if (result.success) {
            console.log('\n🎉 Command deployment completed successfully!');
            if (result.changes > 0) {
                console.log(`📈 Summary: +${result.added || 0} added, ~${result.updated || 0} updated, -${result.removed || 0} removed`);
            }
            console.log(`📋 Total deployed commands: ${result.total}`);
        } else {
            console.error('\n💥 Command deployment failed:', result.error);
        }
        
        return result.success;
    }
}

/**
 * Initialize automatic command deployment
 * @param {Client} client - Discord.js client
 */
async function initializeAutoDeployment(client) {
    try {
        console.log('\n🔧 Initializing automated command deployment...');
        
        const deployer = new AutoDeployCommands(client);
        const success = await deployer.deploy();
        
        if (success) {
            console.log('✅ Automated command deployment initialized successfully');
        } else {
            console.error('❌ Failed to initialize automated command deployment');
        }
        
        return success;
    } catch (error) {
        console.error('💥 Error initializing automated command deployment:', error);
        return false;
    }
}

module.exports = {
    AutoDeployCommands,
    initializeAutoDeployment
}; 
