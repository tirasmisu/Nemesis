// Voice channel configuration
const voiceChannelConfig = {
    // Join to Create channel settings
    joinToCreate: {
        // The ID of the channel users will join to create their own channel
        channelId: '1370435551504896120',
        
        // Category where new voice channels will be created
        categoryId: '1370435337230352455',
        
        // Default channel settings
        defaultUserLimit: 0, // 0 means no limit
        
        // Channel name format (uses member's nickname or username if no nickname)
        nameFormat: "🔊 | {username}'s VC",
        
        // Role ID for Discord Nitro (users need this role to create channels)
        nitroRoleId: '591486031161720853',  // Nitro Booster role ID
        
        // How long (in ms) to keep empty channels before deleting them
        // Set to 0 to delete immediately when empty
        emptyChannelTimeout: 300000, // 5 minutes
    },
    
    // Channel positioning settings
    positioning: {
        // ID of the waiting room channel (new channels will be positioned above this)
        waitingRoomChannelId: 1375969962543284395,
        // Whether to position new channels between join to create and waiting room
        enablePositioning: true
    }
};

module.exports = voiceChannelConfig; 
