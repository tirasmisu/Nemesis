require('dotenv').config();
const { REST, Routes } = require('discord.js');

// Load environment variables
const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;

async function main() {
  try {
    if (!token || !clientId) {
      console.error('Missing environment variables (TOKEN or CLIENT_ID). Please check your .env file.');
      return;
    }

    const rest = new REST({ version: '10' }).setToken(token);

    // Fetch all registered global commands
    console.log('Fetching registered global commands...');
    const globalCommands = await rest.get(Routes.applicationCommands(clientId));
    
    console.log(`Found ${globalCommands.length} global commands.`);

    if (globalCommands.length > 0) {
      console.log('Deleting all global commands...');
      
      // Delete all global commands by setting an empty array
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: [] }
      );
      
      console.log(`Successfully deleted all global commands!`);
    } else {
      console.log('No global commands to delete.');
    }

  } catch (error) {
    console.error('Error deleting global commands:', error);
  }
}

main(); 
