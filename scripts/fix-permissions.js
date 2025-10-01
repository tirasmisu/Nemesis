require('dotenv').config();
const { REST, Routes, PermissionFlagsBits } = require('discord.js');
const path = require('path');
const fs = require('fs');

// Load environment variables
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
      
      try {
        if (!isPublic) {
          console.log(`Setting permissions for staff-only command: ${commandName}`);
          
          // For staff-only commands: Set null permissions, will be controlled by role overrides in Discord UI
          await rest.patch(
            Routes.applicationGuildCommand(clientId, guildId, command.id),
            { 
              body: {
                default_member_permissions: null
              }
            }
          );
          
          console.log(`Updated ${commandName} to use role overrides - configure in Discord UI`);
        } else {
          console.log(`Keeping command public: ${commandName}`);
          
          // For public commands, use null (everyone can use)
          await rest.patch(
            Routes.applicationGuildCommand(clientId, guildId, command.id),
            { 
              body: {
                default_member_permissions: null // Allow everyone by default
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

    console.log('Command permissions reset successfully!');
    console.log('IMPORTANT: You now need to configure role permissions in Discord\'s UI:');
    console.log('1. Go to Server Settings > Integrations > Tranium Bot');
    console.log('2. For each staff command, click on it and add role overrides:');
    console.log('   - Set @everyone to ❌ (deny)');
    console.log('   - Set STAFF to ✓ (allow)');

  } catch (error) {
    console.error('Error updating command permissions:', error);
  }
}

main(); 
