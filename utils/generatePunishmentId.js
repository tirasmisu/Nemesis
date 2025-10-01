const ModerationAction = require('../models/ModerationAction');

// Function to generate a unique 18-digit number for punishment IDs
async function generateUniquePunishmentId() {
    let unique = false;
    let punishmentId;

    while (!unique) {
        // Generate a random 18-digit number
        punishmentId = Math.floor(100000000000000000 + Math.random() * 900000000000000000).toString();

        // Check if this ID already exists in the database
        const existingAction = await ModerationAction.findOne({ actionId: punishmentId });
        if (!existingAction) {
            unique = true; // If no existing action found, the ID is unique
        }
    }

    return punishmentId;
}

module.exports = { generateUniquePunishmentId };
