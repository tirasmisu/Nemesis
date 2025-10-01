const mongoose = require('mongoose');

const blacklistWordSchema = new mongoose.Schema({
    word: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    addedBy: {
        type: String,
        required: true
    },
    addedAt: {
        type: Date,
        default: Date.now
    },
    punishmentId: {
        type: String,
        required: true,
        unique: true
    }
});

// Add index for faster lookups
blacklistWordSchema.index({ word: 1 });

module.exports = mongoose.model('BlacklistWord', blacklistWordSchema); 