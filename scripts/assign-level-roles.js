require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const mongoose = require('mongoose');
const { assignLevelRoles, getLevelFromXP } = require('../services/xpService');
const UserXP = require('../models/UserXP');

// Configure client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

// Database connection
async function connectToDatabase() {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB');
        return true;
    } catch (error) {
        console.error('Failed to connect to MongoDB:', error);
        return false;
    }
}

async function main() {
    try {
        // Connect to database
        const dbConnected = await connectToDatabase();
        if (!dbConnected) {
            console.error('Database connection failed. Aborting...');
            process.exit(1);
        }

        // Log in to Discord
        await client.login(process.env.TOKEN);
        console.log(`Logged in as ${client.user.tag}`);

        const guildId = process.env.GUILD_ID;
        const guild = client.guilds.cache.get(guildId);
        
        if (!guild) {
            console.error(`Could not find guild with ID: ${guildId}`);
            return;
        }

        console.log(`Checking XP and assigning roles for guild: ${guild.name}`);

        // Fetch all users with XP
        const users = await UserXP.find({ guildId });
        console.log(`Found ${users.length} users with XP records`);

        let assignedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        // Process each user
        for (const userXP of users) {
            try {
                // Calculate level
                const level = getLevelFromXP(userXP.xp);
                
                // Skip users with level less than 5
                if (level < 5) {
                    skippedCount++;
                    continue;
                }

                // Fetch member
                const member = await guild.members.fetch(userXP.userId).catch(() => null);
                if (!member) {
                    console.log(`Member not found: ${userXP.userId}`);
                    skippedCount++;
                    continue;
                }

                // Assign roles based on level
                console.log(`Processing ${member.user.tag} - Level ${level}`);
                await assignLevelRoles(member, level);
                assignedCount++;

                // Throttle requests to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                console.error(`Error processing user ${userXP.userId}:`, error);
                errorCount++;
            }
        }

        console.log(`\nLevel Role Assignment Complete!`);
        console.log(`Processed: ${users.length} users`);
        console.log(`Assigned roles: ${assignedCount} users`);
        console.log(`Skipped: ${skippedCount} users`);
        console.log(`Errors: ${errorCount} users`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        // Cleanup
        client.destroy();
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

main();
