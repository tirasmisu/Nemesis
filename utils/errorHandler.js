// This file serves as a compatibility layer to break circular dependencies
// between errorManager.js and commandHelpers.js

// Simple error handling with no dependencies
function handleError(interaction, error, context) {
    console.error(`Error in ${context}:`, error);
    
    try {
        const errorMessage = {
            content: `An error occurred while ${context.toLowerCase()}. The error has been logged.`,
            flags: ['Ephemeral']
        };

        if (interaction) {
            if (interaction.replied || interaction.deferred) {
                interaction.followUp(errorMessage).catch(console.error);
            } else {
                interaction.reply(errorMessage).catch(console.error);
            }
        }
    } catch (followupError) {
        console.error('Error sending error message:', followupError);
    }
}

// Function to send an error message to a user
function sendErrorMessage(interaction, message) {
    try {
        const errorMessage = {
            content: message,
            flags: ['Ephemeral']
        };

        if (interaction) {
            if (interaction.replied || interaction.deferred) {
                interaction.followUp(errorMessage).catch(console.error);
            } else {
                interaction.reply(errorMessage).catch(console.error);
            }
        }
    } catch (followupError) {
        console.error('Error sending error message:', followupError);
    }
}

// Redirect to the main errorManager when it's safe to do so
function handleCommandError(interaction, error, context = 'command execution') {
    // List of error messages that should be treated as normal feedback, not errors
    const knownUserErrors = [
        'You cannot add roles to someone with higher or equal hierarchy',
        'You do not have permission to use this command',
        'User is required'
    ];
    
    // Check if this is a known user error that shouldn't be treated as a system error
    const isKnownUserError = error.message && knownUserErrors.some(msg => error.message.includes(msg));
    
    if (isKnownUserError) {
        // This is expected behavior, so just inform the user without logging as an error
        try {
            sendErrorMessage(interaction, error.message);
            return;
        } catch (replyError) {
            console.log(`Could not reply with known error message: ${replyError.message}`);
            return;
        }
    }
    
    // Log the error
    console.error(`CommandError: ${error.message || error}`);
    if (error.stack) {
        console.error(error.stack);
    }
    
    try {
        sendErrorMessage(interaction, 'An error occurred while processing your command. The error has been logged.');
    } catch (replyError) {
        console.error(`Failed to send error message: ${replyError.message}`);
    }
}

// Create standard error types
class CommandError extends Error {
    constructor(message, type = 'EXECUTION_ERROR', details = {}) {
        super(message);
        this.name = 'CommandError';
        this.type = type;
        this.details = details;
    }
}

function createValidationError(message, details = {}) {
    return new CommandError(message, 'VALIDATION_ERROR', details);
}

function createPermissionError(message, details = {}) {
    return new CommandError(message, 'PERMISSION_ERROR', details);
}

module.exports = {
    handleError,
    handleCommandError,
    CommandError,
    createValidationError,
    createPermissionError,
    sendErrorMessage
}; 
