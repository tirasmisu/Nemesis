const { Collection } = require('discord.js');

// Command aliases
const COMMAND_ALIASES = {
    'ban': ['b', 'banuser', 'banmember'],
    'kick': ['k', 'kickuser', 'kickmember'],
    'mute': ['m', 'muteuser', 'mutemember'],
    'warn': ['w', 'warnuser', 'warnmember'],
    'purge': ['p', 'clear', 'delete', 'bulkdelete'],
    'lock': ['l', 'lockchannel', 'lockdown'],
    'unlock': ['ul', 'unlockchannel', 'unlockdown'],
    'slowmode': ['sm', 'slow', 'slowdown'],
    'role': ['r', 'giverole', 'addrole'],
    'removerole': ['rr', 'takerole', 'removerole'],
    'userinfo': ['ui', 'whois', 'user'],
    'serverinfo': ['si', 'guild', 'guildinfo'],
    'help': ['h', 'commands', 'cmds', 'helpme']
};

// Command categories and their related commands
const COMMAND_CATEGORIES = {
    moderation: ['ban', 'kick', 'mute', 'warn', 'purge', 'lock', 'unlock', 'slowmode'],
    roles: ['role', 'removerole', 'roleinfo', 'roles'],
    info: ['userinfo', 'serverinfo', 'roleinfo', 'channelinfo'],
    utility: ['help', 'ping', 'uptime', 'stats'],
    fun: ['meme', 'gif', '8ball', 'roll']
};

// Command usage statistics
let commandUsage = new Collection();

// Initialize command usage tracking
function initializeCommandUsage() {
    // Load existing usage data if available
    try {
        const data = require('../data/command_usage.json');
        for (const [command, usage] of Object.entries(data)) {
            commandUsage.set(command, usage);
        }
    } catch {
        // No existing data, start fresh
    }
}

// Update command usage
function updateCommandUsage(commandName) {
    const currentUsage = commandUsage.get(commandName) || {
        total: 0,
        lastUsed: null,
        byUser: new Collection(),
        byChannel: new Collection()
    };
    
    currentUsage.total++;
    currentUsage.lastUsed = Date.now();
    
    commandUsage.set(commandName, currentUsage);
    saveCommandUsage();
}

// Save command usage to file
function saveCommandUsage() {
    const data = {};
    commandUsage.forEach((usage, command) => {
        data[command] = {
            total: usage.total,
            lastUsed: usage.lastUsed,
            byUser: Array.from(usage.byUser.entries()),
            byChannel: Array.from(usage.byChannel.entries())
        };
    });
    
    require('fs').writeFileSync(
        require('path').join(__dirname, '../data/command_usage.json'),
        JSON.stringify(data, null, 2)
    );
}

// Get command suggestions based on input
function getCommandSuggestions(input, context = {}) {
    const suggestions = new Set();
    
    // Check for exact alias match
    for (const [command, aliases] of Object.entries(COMMAND_ALIASES)) {
        if (aliases.includes(input.toLowerCase())) {
            suggestions.add(command);
        }
    }
    
    // Check for similar commands using Levenshtein distance
    const distance = (str1, str2) => {
        const m = str1.length;
        const n = str2.length;
        const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));
        
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
                }
            }
        }
        
        return dp[m][n];
    };
    
    // Find similar commands
    const allCommands = Object.keys(COMMAND_ALIASES);
    for (const command of allCommands) {
        if (distance(input.toLowerCase(), command) <= 2) {
            suggestions.add(command);
        }
    }
    
    // Add context-based suggestions
    if (context.category) {
        const categoryCommands = COMMAND_CATEGORIES[context.category] || [];
        categoryCommands.forEach(cmd => suggestions.add(cmd));
    }
    
    // Add usage-based suggestions
    const popularCommands = Array.from(commandUsage.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 5)
        .map(([cmd]) => cmd);
    
    popularCommands.forEach(cmd => suggestions.add(cmd));
    
    return Array.from(suggestions);
}

// Get command category
function getCommandCategory(commandName) {
    for (const [category, commands] of Object.entries(COMMAND_CATEGORIES)) {
        if (commands.includes(commandName)) {
            return category;
        }
    }
    return 'other';
}

// Get related commands
function getRelatedCommands(commandName) {
    const category = getCommandCategory(commandName);
    const related = new Set();
    
    // Add commands from the same category
    if (category !== 'other') {
        COMMAND_CATEGORIES[category].forEach(cmd => {
            if (cmd !== commandName) {
                related.add(cmd);
            }
        });
    }
    
    // Add commands that are often used together
    const commandUsage = getCommandUsage(commandName);
    if (commandUsage && commandUsage.relatedCommands) {
        commandUsage.relatedCommands.forEach(cmd => related.add(cmd));
    }
    
    return Array.from(related);
}

// Get command usage statistics
function getCommandUsage(commandName) {
    return commandUsage.get(commandName);
}

// Get popular commands
function getPopularCommands(limit = 5) {
    return Array.from(commandUsage.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, limit)
        .map(([cmd, usage]) => ({
            command: cmd,
            total: usage.total,
            lastUsed: usage.lastUsed
        }));
}

module.exports = {
    initializeCommandUsage,
    updateCommandUsage,
    getCommandSuggestions,
    getCommandCategory,
    getRelatedCommands,
    getCommandUsage,
    getPopularCommands,
    COMMAND_ALIASES,
    COMMAND_CATEGORIES
}; 
