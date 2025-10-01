require('dotenv').config();
const { REST, Routes, PermissionFlagsBits } = require('discord.js');

// Load environment variables
const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

// Configure role IDs
const STAFF_ROLE_ID = '1351240039668908193'; // Staff role ID

// Define which commands should be public vs staff-only
const PUBLIC_COMMANDS = [
  'ping',
  'help',
  'userinfo',
  'avatar',
  'rank',
  'leaderboard',
  'level',
  'invite' // Making invite command public
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

    // Update each command's permissions individually
    for (const command of commands) {
      const commandName = command.name;
      const isPublic = PUBLIC_COMMANDS.includes(commandName.toLowerCase());
      
      // Default permissions needed to use commands
      // For staff-only commands: require administrator OR manage server permissions
      // For public commands: no permissions required (null or 0)
      try {
        if (!isPublic) {
          console.log(`Setting permissions for staff-only command: ${commandName}`);
          
          // Calculate the permission value - requiring Admin (8) or Manage Server (32) permission
          // This is in decimal, representing the bitfield for ADMINISTRATOR or MANAGE_GUILD
          const requiredPerms = (
            PermissionFlagsBits.Administrator | 
            PermissionFlagsBits.ManageGuild
          ).toString();
          
          await rest.patch(
            Routes.applicationGuildCommand(clientId, guildId, command.id),
            { 
              body: {
                default_member_permissions: requiredPerms
              }
            }
          );
          
          console.log(`Updated ${commandName} to be staff-only (requires Admin or Manage Server permission)`);
        } else {
          console.log(`Keeping command public: ${commandName}`);
          
          // For public commands, use "0" to allow everyone
          await rest.patch(
            Routes.applicationGuildCommand(clientId, guildId, command.id),
            { 
              body: {
                default_member_permissions: "0" // Allow everyone by default
              }
            }
          );
          
          console.log(`Updated ${commandName} to be public`);
        }
      } catch (error) {
        console.error(`Error updating ${commandName}:`, error);
      }
      
      // Short delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('Command permissions updated successfully!');

  } catch (error) {
    console.error('Error updating command permissions:', error);
  }
}

main(); 
