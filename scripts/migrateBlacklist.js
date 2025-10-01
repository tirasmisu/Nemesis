const fs = require('fs').promises;
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

// Import the model
const BlacklistWord = require('../models/BlacklistWord');

const blacklistFilePath = path.join(__dirname, '../data/blacklist.json');

async function migrateBlacklist() {
    try {
        console.log('🔄 Starting blacklist migration from file to database...');
        
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');
        
        // Check if file exists
        try {
            const fileData = await fs.readFile(blacklistFilePath, 'utf8');
            const parsedData = JSON.parse(fileData);
            
            let words = [];
            if (Array.isArray(parsedData)) {
                words = parsedData;
            } else if (parsedData && Array.isArray(parsedData.words)) {
                words = parsedData.words;
            }
            
            console.log(`📄 Found ${words.length} words in blacklist file`);
            
            if (words.length === 0) {
                console.log('ℹ️  No words to migrate');
                return;
            }
            
            // Check existing database entries
            const existingCount = await BlacklistWord.countDocuments();
            console.log(`💾 Database currently has ${existingCount} blacklisted words`);
            
            let migrated = 0;
            let skipped = 0;
            
            for (const word of words) {
                const normalizedWord = word.toLowerCase().trim();
                
                // Check if already exists
                const existing = await BlacklistWord.findOne({ word: normalizedWord });
                if (existing) {
                    skipped++;
                    continue;
                }
                
                // Add to database
                const newWord = new BlacklistWord({
                    word: normalizedWord,
                    addedBy: 'migration',
                    punishmentId: `migrate-${Date.now()}-${migrated}`
                });
                
                await newWord.save();
                migrated++;
            }
            
            console.log(`✅ Migration complete!`);
            console.log(`   - Migrated: ${migrated} words`);
            console.log(`   - Skipped (duplicates): ${skipped} words`);
            console.log(`   - Total in database: ${await BlacklistWord.countDocuments()} words`);
            
            // Backup the file
            const backupPath = blacklistFilePath + '.backup.' + Date.now();
            await fs.copyFile(blacklistFilePath, backupPath);
            console.log(`📁 Backed up original file to: ${backupPath}`);
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('ℹ️  No blacklist file found, nothing to migrate');
            } else {
                throw error;
            }
        }
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
    }
}

// Run migration if this script is called directly
if (require.main === module) {
    migrateBlacklist()
        .then(() => {
            console.log('🎉 Migration script completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Migration script failed:', error);
            process.exit(1);
        });
}

module.exports = { migrateBlacklist }; 