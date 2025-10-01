const mongoose = require('mongoose');

// Define the schema for user XP data
const userXPSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    guildId: {
        type: String,
        required: true,
        index: true
    },
    xp: {
        type: Number,
        default: 0,
        min: 0
    },
    level: {
        type: Number,
        default: 0,
        min: 0
    },
    messageCount: {
        type: Number,
        default: 0,
        min: 0
    },
    voiceTimeMinutes: {
        type: Number,
        default: 0,
        min: 0
    },
    lastMessageTimestamp: {
        type: Date,
        default: null
    },
    lastVoiceTimestamp: {
        type: Date,
        default: null
    },
    voiceChannelId: {
        type: String,
        default: null
    },
    voiceJoinedAt: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    // Add timestamps for createdAt and updatedAt
    timestamps: true
});

// Create a compound index for faster lookups by user and guild
userXPSchema.index({ userId: 1, guildId: 1 }, { unique: true });

// Add a static method to find or create user records
userXPSchema.statics.findOrCreate = async function(userId, guildId) {
    let userXP = await this.findOne({ userId, guildId });
    
    if (!userXP) {
        userXP = new this({
            userId,
            guildId,
            xp: 0,
            level: 0
        });
        await userXP.save();
    }
    
    return userXP;
};

// Calculate the level from XP using a standard formula
userXPSchema.methods.calculateLevel = function() {
    // Formula: level = 0.1 * sqrt(xp)
    return Math.floor(0.1 * Math.sqrt(this.xp));
};

// Update the user's level based on current XP
userXPSchema.methods.updateLevel = function() {
    const newLevel = this.calculateLevel();
    const oldLevel = this.level;
    
    if (newLevel !== oldLevel) {
        this.level = newLevel;
    }
    
    return {
        oldLevel,
        newLevel,
        hasLeveledUp: newLevel > oldLevel
    };
};

// Pre-save hook to update level before saving
userXPSchema.pre('save', function(next) {
    this.updateLevel();
    this.updatedAt = new Date();
    next();
});

// Add a method to reset user's XP
userXPSchema.methods.reset = async function() {
    this.xp = 0;
    this.level = 0;
    this.messageCount = 0;
    this.voiceTimeMinutes = 0;
    await this.save();
    return this;
};

// Create and export the model
const UserXP = mongoose.model('UserXP', userXPSchema);
module.exports = UserXP; 
