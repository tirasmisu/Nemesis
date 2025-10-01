const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid'); // Import UUID for unique IDs

const moderationActionSchema = new mongoose.Schema({
    actionId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    moderatorId: { type: String, required: true },
    action: { type: String, required: true }, // e.g., "mute", "ban", "kick", "warn"
    reason: { type: String, required: true },
    duration: { type: String, default: null },
    timestamp: { type: Date, default: Date.now },
    active: { type: Boolean, default: true }, // For actions like mutes, to mark if they are still active
    metadata: { type: Object, default: {} }
});

// Create model only if it doesn't exist yet (prevents model overwrite error)
const ModerationAction = mongoose.models.ModerationAction || 
    mongoose.model('ModerationAction', moderationActionSchema);

module.exports = ModerationAction;
