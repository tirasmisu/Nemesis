require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const mongoose = require('mongoose');
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
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
      ]
    });
    await client.login(process.env.TOKEN);
    console.log(`Logged in as ${client.user.tag}`);

    const guildId = process.env.GUILD_ID;
    const guild = client.guilds.cache.get(guildId);
    
    if (!guild) {
      console.error(`Guild not found with ID: ${guildId}`);
      return;
    }

    // Define level roles - hardcoded here for direct access
    const LEVEL_ROLES = {
      5: '1066909132243865660',   // Level 5 role
      10: '1066909130964611123',  // Level 10 role
      15: '1066909129941192705',  // Level 15 role
      25: '1066909500210151555'   // Level 25 role
    };

    // For debugging - verify roles exist
    console.log("Checking if level roles exist in server:");
    for (const [level, roleId] of Object.entries(LEVEL_ROLES)) {
      const role = guild.roles.cache.get(roleId);
      console.log(`Level ${level} role (${roleId}): ${role ? "Found ✅" : "NOT FOUND ❌"}`);
    }

    // Find the user with level 69 (can be any level or username)
    const targetLevel = 69;
    console.log(`Looking for user with level ${targetLevel}...`);
    
    const userXP = await UserXP.findOne({ level: targetLevel });
    
    if (!userXP) {
      console.log(`No user with level ${targetLevel} found in database`);
      // Try searching differently
      const allUsers = await UserXP.find().sort({ level: -1 }).limit(10);
      console.log("Top 10 users by level:");
      for (const user of allUsers) {
        console.log(`User ID: ${user.userId}, Level: ${user.level}, XP: ${user.xp}`);
      }
      return;
    }

    console.log(`Found user with ID ${userXP.userId} at level ${userXP.level}`);

    // Fetch member
    const member = await guild.members.fetch(userXP.userId).catch(error => {
      console.error(`Error fetching member: ${error.message}`);
      return null;
    });
    
    if (!member) {
      console.log(`Member with ID ${userXP.userId} not found in guild`);
      return;
    }

    console.log(`Working with member: ${member.user.tag} (${member.id})`);
    console.log(`Current roles: ${member.roles.cache.map(r => r.name).join(', ')}`);

    // Manual role assignment - directly adding roles
    const rolesToAdd = [];
    
    for (const [level, roleId] of Object.entries(LEVEL_ROLES)) {
      if (userXP.level >= Number(level)) {
        console.log(`User qualifies for level ${level} role`);
        const role = guild.roles.cache.get(roleId);
        
        if (role) {
          if (member.roles.cache.has(roleId)) {
            console.log(`User already has role: ${role.name} (${roleId})`);
          } else {
            console.log(`Adding role: ${role.name} (${roleId})`);
            rolesToAdd.push(roleId);
          }
        } else {
          console.log(`⚠️ Role with ID ${roleId} not found in guild`);
        }
      }
    }

    // Apply roles
    if (rolesToAdd.length > 0) {
      console.log(`Adding ${rolesToAdd.length} roles...`);
      
      try {
        for (const roleId of rolesToAdd) {
          await member.roles.add(roleId);
          console.log(`Successfully added role ${roleId}`);
          // Add delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log("All roles added successfully");
      } catch (roleError) {
        console.error(`Error adding roles: ${roleError.message}`);
        if (roleError.code === 50013) {
          console.error("⚠️ BOT LACKS PERMISSION to manage roles!");
        }
      }
    } else {
      console.log("No new roles to add");
    }

    console.log("Role update completed");
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Disconnect and exit
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
}

main(); 
