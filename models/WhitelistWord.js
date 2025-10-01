const mongoose = require('mongoose');

const whitelistWordSchema = new mongoose.Schema({
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
    },
    reason: {
        type: String,
        default: "Contains blacklisted substring but is legitimate"
    }
});

// Add index for faster lookups
whitelistWordSchema.index({ word: 1 });

module.exports = mongoose.model('WhitelistWord', whitelistWordSchema); 