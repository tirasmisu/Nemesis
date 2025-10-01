const fs = require('fs').promises;
const path = require('path');
const { handleCommandError } = require('./errorManager');

class EventLoader {
    constructor() {
        this.eventsPath = path.join(__dirname, '..', 'events');
    }

    async loadEvents(client) {
        try {
            const eventFiles = await fs.readdir(this.eventsPath);
            
            for (const file of eventFiles) {
                if (!file.endsWith('.js')) continue;
                
                try {
                    const event = require(path.join(this.eventsPath, file));
                    
                    if (event.once) {
                        client.once(event.name, (...args) => this.executeEvent(event, ...args));
                    } else {
                        client.on(event.name, (...args) => this.executeEvent(event, ...args));
                    }
                    
                    console.log(`Loaded event: ${event.name}`);
                } catch (error) {
                    console.error(`Error loading event ${file}:`, error);
                }
            }
        } catch (error) {
            console.error('Error loading events:', error);
            throw error;
        }
    }

    async executeEvent(event, ...args) {
        try {
            await event.execute(...args);
        } catch (error) {
            handleCommandError(null, error, `event: ${event.name}`);
        }
    }
}

module.exports = new EventLoader(); 
