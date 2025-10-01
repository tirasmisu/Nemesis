require('dotenv').config();
const { REST, Routes, ApplicationCommandPermissionType } = require('discord.js');

// Load environment variables
const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

// Configure role IDs - UPDATE THESE WITH YOUR ACTUAL ROLE IDs
const STAFF_ROLE_ID = '1351240039668908193'; // Staff role ID
const EVERYONE_ROLE_ID = guildId; // @everyone role ID is the same as the guild ID

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

async function main() {
  try {
    if (!token || !clientId || !guildId) {
      console.error('Missing environment variables. Please check your .env file.');
      return;
    }

    const rest = new REST({ version: '10' }).setToken(token);

    // Fetch all registered commands
    console.log('Fetching registered commands...');
    const commands = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
    
    if (!commands.length) {
      console.log('No commands found. Please deploy commands first.');
      return;
    }
    
    console.log(`Found ${commands.length} registered commands.`);

    // Get the guild commands permissions endpoints
    const fullPermissions = [];

    // For each command, set up permissions
    for (const command of commands) {
      const commandName = command.name;
      const isPublic = PUBLIC_COMMANDS.includes(commandName.toLowerCase());
      
      // Set up permissions for this command
      const permissions = [];
      
      if (!isPublic) {
        console.log(`Setting permissions for staff-only command: ${commandName}`);
        
        // Add @everyone - DENY access
        permissions.push({
          id: EVERYONE_ROLE_ID,
          type: ApplicationCommandPermissionType.Role,
          permission: false // Deny access
        });
        
        // Add STAFF role - ALLOW access
        permissions.push({
          id: STAFF_ROLE_ID,
          type: ApplicationCommandPermissionType.Role,
          permission: true // Allow access
        });
      } else {
        console.log(`Keeping command public: ${commandName}`);
        
        // For public commands, explicitly allow @everyone (optional)
        permissions.push({
          id: EVERYONE_ROLE_ID,
          type: ApplicationCommandPermissionType.Role,
          permission: true // Allow access
        });
      }
      
      // Add this command's permissions to the full permissions array
      fullPermissions.push({
        id: command.id,
        permissions: permissions
      });
    }

    // Apply permissions to all commands at once
    console.log('Applying permissions to all commands...');
    
    // Use the bulkOverwriteGuildApplicationCommandPermissions endpoint
    try {
      await rest.put(
        Routes.guildApplicationCommandsPermissions(clientId, guildId),
        { body: fullPermissions }
      );
      console.log('Successfully set permissions for all commands!');
    } catch (error) {
      console.error('Error setting permissions:', error);
      
      // If bulk update fails, try individual updates
      console.log('Trying individual permission updates...');
      
      for (const commandPermissions of fullPermissions) {
        try {
          await rest.put(
            Routes.applicationCommandPermissions(clientId, guildId, commandPermissions.id),
            { body: { permissions: commandPermissions.permissions } }
          );
          console.log(`Updated permissions for command ID ${commandPermissions.id}`);
        } catch (error) {
          console.error(`Error updating permissions for command ID ${commandPermissions.id}:`, error);
        }
        
        // Short delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

  } catch (error) {
    console.error('Error during permission setting:', error);
  }
}

main(); 
