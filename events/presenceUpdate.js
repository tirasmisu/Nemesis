const { updateOnCallRole } = require('../utils/commandHelpers');

module.exports = {
    name: 'presenceUpdate',
    async execute(oldPresence, newPresence) {
        try {
            // Update on-call role when staff member's presence changes
            if (oldPresence?.member) {
                await updateOnCallRole(oldPresence.member);
            }
            if (newPresence?.member) {
                await updateOnCallRole(newPresence.member);
            }
        } catch (error) {
            console.error('Error in presenceUpdate event:', error);
        }
    }
}; 
