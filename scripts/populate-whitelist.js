const mongoose = require('mongoose');
const WhitelistWord = require('../models/WhitelistWord');

// Common words that might be falsely flagged by blacklisted substrings
const commonWhitelistWords = [
    { word: 'basement', reason: 'Common house term containing "semen"' },
    { word: 'assessment', reason: 'Academic term containing "ass"' },
    { word: 'assignment', reason: 'Academic term containing "ass"' },
    { word: 'assistant', reason: 'Job title containing "ass"' },
    { word: 'assassin', reason: 'Historical/gaming term containing "ass"' },
    { word: 'assemble', reason: 'Common verb containing "ass"' },
    { word: 'assembly', reason: 'Common noun containing "ass"' },
    { word: 'assume', reason: 'Common verb containing "ass"' },
    { word: 'assumption', reason: 'Common noun containing "ass"' },
    { word: 'massachusetts', reason: 'US state name containing "ass"' },
    { word: 'class', reason: 'Common noun containing "ass"' },
    { word: 'glasses', reason: 'Common noun containing "ass"' },
    { word: 'classic', reason: 'Common adjective containing "ass"' },
    { word: 'grass', reason: 'Common noun containing "ass"' },
    { word: 'pass', reason: 'Common verb containing "ass"' },
    { word: 'password', reason: 'Common noun containing "ass"' },
    { word: 'passport', reason: 'Common noun containing "ass"' },
    { word: 'massacre', reason: 'Historical term containing "ass"' },
    { word: 'message', reason: 'Common noun containing "ass"' },
    { word: 'passage', reason: 'Common noun containing "ass"' },
    { word: 'passenger', reason: 'Common noun containing "ass"' },
    { word: 'compass', reason: 'Common noun containing "ass"' },
    { word: 'embarrass', reason: 'Common verb containing "ass"' },
    { word: 'embarrassment', reason: 'Common noun containing "ass"' },
    { word: 'harass', reason: 'Common verb containing "ass"' },
    { word: 'harassment', reason: 'Common noun containing "ass"' },
    { word: 'surpass', reason: 'Common verb containing "ass"' },
    { word: 'trespass', reason: 'Common verb containing "ass"' },
    { word: 'bypass', reason: 'Common verb containing "ass"' },
    { word: 'overpass', reason: 'Common noun containing "ass"' },
    { word: 'underpass', reason: 'Common noun containing "ass"' },
    { word: 'analysis', reason: 'Common noun containing "anal"' },
    { word: 'analyze', reason: 'Common verb containing "anal"' },
    { word: 'analyst', reason: 'Common noun containing "anal"' },
    { word: 'analytical', reason: 'Common adjective containing "anal"' },
    { word: 'canal', reason: 'Common noun containing "anal"' },
    { word: 'signal', reason: 'Common noun containing "anal"' },
    { word: 'original', reason: 'Common adjective containing "anal"' },
    { word: 'marginal', reason: 'Common adjective containing "anal"' },
    { word: 'final', reason: 'Common adjective containing "anal"' },
    { word: 'international', reason: 'Common adjective containing "anal"' },
    { word: 'national', reason: 'Common adjective containing "anal"' },
    { word: 'regional', reason: 'Common adjective containing "anal"' },
    { word: 'personal', reason: 'Common adjective containing "anal"' },
    { word: 'professional', reason: 'Common adjective containing "anal"' },
    { word: 'educational', reason: 'Common adjective containing "anal"' },
    { word: 'additional', reason: 'Common adjective containing "anal"' },
    { word: 'traditional', reason: 'Common adjective containing "anal"' },
    { word: 'functional', reason: 'Common adjective containing "anal"' },
    { word: 'optional', reason: 'Common adjective containing "anal"' },
    { word: 'rational', reason: 'Common adjective containing "anal"' },
    { word: 'seasonal', reason: 'Common adjective containing "anal"' },
    { word: 'journal', reason: 'Common noun containing "anal"' },
    { word: 'criminal', reason: 'Common noun/adjective containing "anal"' },
    { word: 'terminal', reason: 'Common noun/adjective containing "anal"' },
    { word: 'arsenal', reason: 'Common noun containing "anal"' },
    { word: 'arsenal', reason: 'Football team name containing "anal"' },
    { word: 'phenol', reason: 'Chemical term containing "anal"' },
    { word: 'analog', reason: 'Common adjective containing "anal"' },
    { word: 'analogue', reason: 'Common adjective containing "anal"' },
];

async function populateWhitelist() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/traniumbot');
        console.log('✅ Connected to MongoDB');

        console.log(`📝 Processing ${commonWhitelistWords.length} whitelist entries...`);

        let added = 0;
        let skipped = 0;

        for (const entry of commonWhitelistWords) {
            const existingWord = await WhitelistWord.findOne({ word: entry.word.toLowerCase() });
            
            if (existingWord) {
                console.log(`⏭️  Skipping "${entry.word}" - already exists`);
                skipped++;
            } else {
                const newWord = new WhitelistWord({
                    word: entry.word.toLowerCase(),
                    addedBy: 'system',
                    punishmentId: `whitelist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    reason: entry.reason
                });
                
                await newWord.save();
                console.log(`✅ Added "${entry.word}" to whitelist`);
                added++;
            }
        }

        console.log(`\n📊 Results:`);
        console.log(`   Added: ${added} words`);
        console.log(`   Skipped: ${skipped} words`);
        console.log(`   Total processed: ${added + skipped} words`);

        console.log('\n🎉 Whitelist population complete!');
        
    } catch (error) {
        console.error('❌ Error populating whitelist:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
    }
}

// Run the script if called directly
if (require.main === module) {
    populateWhitelist();
}

module.exports = { populateWhitelist, commonWhitelistWords }; 