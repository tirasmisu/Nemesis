const logger = require('./logger');
const BlacklistWord = require('../models/BlacklistWord');
const WhitelistWord = require('../models/WhitelistWord');

// In-memory cache for blacklisted words to improve performance
let blacklistedWords = [];
let whitelistedWords = [];
let cacheInitialized = false;

// Initialize the blacklist cache - only called once at startup and when manually refreshed
async function initializeCache() {
    try {
        // Ensure blacklistedWords is always an array
        if (!Array.isArray(blacklistedWords)) {
            blacklistedWords = [];
        }
        
        // Ensure whitelistedWords is always an array
        if (!Array.isArray(whitelistedWords)) {
            whitelistedWords = [];
        }
        
        // Fetch blacklisted words from database
        const blacklistWords = await BlacklistWord.find({}, 'word').lean();
        
        // Ensure words is an array and extract word strings
        if (Array.isArray(blacklistWords)) {
            blacklistedWords = blacklistWords.map(doc => doc && doc.word ? doc.word : '').filter(word => word);
        } else {
            blacklistedWords = [];
        }
        
        // Fetch whitelisted words from database
        const whitelistWords = await WhitelistWord.find({}, 'word').lean();
        
        // Ensure words is an array and extract word strings
        if (Array.isArray(whitelistWords)) {
            whitelistedWords = whitelistWords.map(doc => doc && doc.word ? doc.word : '').filter(word => word);
        } else {
            whitelistedWords = [];
        }
        
        cacheInitialized = true;
        
        console.log(`[BlacklistHelper] Loaded ${blacklistedWords.length} blacklisted words and ${whitelistedWords.length} whitelisted words from database.`);
    } catch (error) {
        console.error('[BlacklistHelper] Error loading blacklist/whitelist from database:', error);
        // Keep existing cache on error, but ensure it's an array
        if (!cacheInitialized || !Array.isArray(blacklistedWords)) {
            blacklistedWords = []; // Initialize as empty array if never cached or corrupted
            cacheInitialized = true;
        }
        if (!Array.isArray(whitelistedWords)) {
            whitelistedWords = [];
        }
    }
}

// Legacy function for backward compatibility - now just ensures cache is initialized
async function loadBlacklist(forceReload = false) {
    if (forceReload || !cacheInitialized) {
        await initializeCache();
    }
}

// Force refresh the cache
async function refreshCache() {
    console.log('[BlacklistHelper] Manually refreshing blacklist cache...');
    await initializeCache();
}

// Add a word to the blacklist
async function addToBlacklist(word) {
    if (!word || typeof word !== 'string') {
        return { success: false, error: 'Invalid word provided' };
    }
    
    const normalizedWord = word.toLowerCase().trim();
    
    // Check if already exists
    const existing = await BlacklistWord.findOne({ word: normalizedWord });
    if (existing) {
        return { success: false, error: 'Word is already blacklisted' };
    }
    
    // Add to database
    const newWord = new BlacklistWord({ 
        word: normalizedWord,
        addedBy: 'system', // This will be overridden by commands
        punishmentId: 'legacy' // This will be overridden by commands
    });
    await newWord.save();
    
    // Update cache
    await refreshCache();
    return { success: true, word: normalizedWord };
}

// Remove a word from the blacklist
async function removeFromBlacklist(word) {
    if (!word || typeof word !== 'string') {
        return { success: false, error: 'Invalid word provided' };
    }
    
    const normalizedWord = word.toLowerCase().trim();
    
    // Check if exists
    const existing = await BlacklistWord.findOne({ word: normalizedWord });
    if (!existing) {
        return { success: false, error: 'Word is not in blacklist' };
    }
    
    // Remove from database
    await BlacklistWord.deleteOne({ word: normalizedWord });
    
    // Update cache
    await refreshCache();
    return { success: true, word: normalizedWord };
}

// Add a word to the whitelist
async function addToWhitelist(word) {
    if (!word || typeof word !== 'string') {
        return { success: false, error: 'Invalid word provided' };
    }
    
    const normalizedWord = word.toLowerCase().trim();
    
    // Check if already exists
    const existing = await WhitelistWord.findOne({ word: normalizedWord });
    if (existing) {
        return { success: false, error: 'Word is already whitelisted' };
    }
    
    // Add to database
    const newWord = new WhitelistWord({ 
        word: normalizedWord,
        addedBy: 'system', // This will be overridden by commands
        punishmentId: 'legacy' // This will be overridden by commands
    });
    await newWord.save();
    
    // Update cache
    await refreshCache();
    return { success: true, word: normalizedWord };
}

// Remove a word from the whitelist
async function removeFromWhitelist(word) {
    if (!word || typeof word !== 'string') {
        return { success: false, error: 'Invalid word provided' };
    }
    
    const normalizedWord = word.toLowerCase().trim();
    
    // Check if exists
    const existing = await WhitelistWord.findOne({ word: normalizedWord });
    if (!existing) {
        return { success: false, error: 'Word is not in whitelist' };
    }
    
    // Remove from database
    await WhitelistWord.deleteOne({ word: normalizedWord });
    
    // Update cache
    await refreshCache();
    return { success: true, word: normalizedWord };
}

// Check if a message contains blacklisted words
function containsBlacklistedWord(message) {
    if (!message || typeof message !== 'string') {
        return { found: false };
    }
    
    // If cache not initialized, return false (startup protection)
    if (!cacheInitialized) {
        console.warn('[BlacklistHelper] Cache not initialized yet, skipping blacklist check');
        return { found: false };
    }
    
    // Ensure blacklistedWords is an array
    if (!Array.isArray(blacklistedWords)) {
        console.warn('[BlacklistHelper] blacklistedWords is not an array, initializing as empty array');
        blacklistedWords = [];
        return { found: false };
    }
    
    // Ensure whitelistedWords is an array
    if (!Array.isArray(whitelistedWords)) {
        console.warn('[BlacklistHelper] whitelistedWords is not an array, initializing as empty array');
        whitelistedWords = [];
    }
    
    const normalizedMessage = message.toLowerCase();
    
    // First check if any complete words in the message are whitelisted
    const words = normalizedMessage.split(/\s+/);
    for (const word of words) {
        const cleanWord = word.replace(/[^\w]/g, ''); // Remove punctuation
        if (whitelistedWords.includes(cleanWord)) {
            // If any word in the message is whitelisted, allow the entire message
            return { found: false, whitelistedWord: cleanWord };
        }
    }
    
    const foundWords = [];
    
    try {
        for (const blacklistedWord of blacklistedWords) {
            if (blacklistedWord && typeof blacklistedWord === 'string' && normalizedMessage.includes(blacklistedWord)) {
                foundWords.push(blacklistedWord);
            }
        }
    } catch (error) {
        console.error('[BlacklistHelper] Error checking blacklisted words:', error);
        return { found: false };
    }
    
    return { 
        found: foundWords.length > 0, 
        words: foundWords 
    };
}

// Get the current blacklist
function getBlacklist() {
    if (!cacheInitialized) {
        console.warn('[BlacklistHelper] Cache not initialized yet, returning empty blacklist');
        return [];
    }
    return [...blacklistedWords];
}

// Initialize the cache at startup
initializeCache().catch(error => {
    console.error('[BlacklistHelper] Failed to initialize blacklist cache at startup:', error);
});

module.exports = {
    addToBlacklist,
    removeFromBlacklist,
    addToWhitelist,
    removeFromWhitelist,
    containsBlacklistedWord,
    getBlacklist,
    getBlacklistedWords: getBlacklist, // Alias for backward compatibility
    getWhitelistedWords: () => [...whitelistedWords],
    refreshCache,
    initializeCache,
    loadBlacklist // Add missing function
}; 
