const ModerationAction = require('../models/ModerationAction');
const { generateUniquePunishmentId } = require('../utils/generatePunishmentId');

/**
 * Validates that a moderation action has the required fields
 * @param {Object} action The action object to validate
 * @returns {Boolean} True if the action is valid
 * @throws {Error} If the action is missing required fields
 */
async function validateAction(action) {
    const requiredFields = ['userId', 'moderatorId', 'action', 'reason'];
    for (const field of requiredFields) {
        if (!action[field]) {
            throw new Error(`Missing required field: ${field}`);
        }
    }
    return true;
}

/**
 * Processes an action by validating it
 * @param {Object} action The action object to process
 * @returns {Object} The processed action
 */
async function processAction(action) {
    try {
        await validateAction(action);
        return action;
    } catch (error) {
        throw new Error(`Invalid moderation action: ${error.message}`);
    }
}

/**
 * Saves a moderation action to the database
 * @param {Object} action The action object to save
 * @returns {Object} The saved action
 */
async function saveModerationAction(action) {
    try {
        // If no actionId is provided, generate one
        if (!action.actionId) {
            action.actionId = await generateUniquePunishmentId();
        }
        
        await validateAction(action);
        
        // Set default values
        if (action.active === undefined) action.active = true;
        if (action.timestamp === undefined) action.timestamp = new Date();
        if (action.metadata === undefined) action.metadata = {};
        
        // Create the document
        return await ModerationAction.create(action);
    } catch (error) {
        console.error('Error saving moderation action:', error);
        throw new Error(`Failed to save moderation action: ${error.message}`);
    }
}

/**
 * Finds an active moderation action
 * @param {String} userId The user ID
 * @param {String} actionType The action type
 * @returns {Object} The active action, if found
 */
async function findActiveAction(userId, actionType) {
    try {
        return await ModerationAction.findOne({
            userId,
            action: actionType,
            active: true
        });
    } catch (error) {
        console.error('Error finding active action:', error);
        throw new Error(`Failed to find active action: ${error.message}`);
    }
}

/**
 * Deactivates a moderation action
 * @param {String} actionId The action ID
 * @returns {Object} The updated action
 */
async function deactivateAction(actionId) {
    try {
        return await ModerationAction.findOneAndUpdate(
            { actionId, active: true },
            { active: false },
            { new: true }
        );
    } catch (error) {
        console.error('Error deactivating action:', error);
        throw new Error(`Failed to deactivate action: ${error.message}`);
    }
}

module.exports = {
    validateAction,
    processAction,
    saveModerationAction,
    findActiveAction,
    deactivateAction
};
