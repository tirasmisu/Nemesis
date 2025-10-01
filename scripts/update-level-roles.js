require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const mongoose = require('mongoose');
const { assignLevelRoles } = require('../services/xpService');
const UserXP = require('../models/UserXP');

async function main() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');

    // Log in to Discord
    const client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
    });
    await client.login(process.env.TOKEN);
    console.log(`Logged in as ${client.user.tag}`);

    const guildId = process.env.GUILD_ID;
    const guild = client.guilds.cache.get(guildId);
    
    if (!guild) {
      console.error('Guild not found');
      return;
    }

    // Find the user with level 69
    const userXP = await UserXP.findOne({ level: 69 });
    
    if (!userXP) {
      console.log('No user with level 69 found');
      return;
    }

    console.log(`Found user with ID ${userXP.userId} at level ${userXP.level}`);

    // Fetch member
    const member = await guild.members.fetch(userXP.userId).catch(() => null);
    if (!member) {
      console.log('Member not found in guild');
      return;
    }

    console.log(`Assigning level roles to ${member.user.tag}`);
    await assignLevelRoles(member, userXP.level);
    console.log('Roles updated successfully');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Disconnect
    mongoose.disconnect();
    process.exit(0);
  }
}

main(); 
