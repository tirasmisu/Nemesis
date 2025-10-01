const fs = require('fs/promises');
const path = require('path');

const TICKETS_FILE = path.join(__dirname, '../data/activeTickets.json');

class TicketPersistence {
    constructor() {
        this.userToThread = new Map();
        this.threadToUser = new Map();
        this.loaded = false;
    }

    // Load ticket mappings from file
    async loadTickets() {
        try {
            // Check if file exists
            await fs.access(TICKETS_FILE);
            
            // Read the file
            const data = await fs.readFile(TICKETS_FILE, 'utf-8');
            const ticketData = JSON.parse(data);
            
            // Restore the Maps
            this.userToThread.clear();
            this.threadToUser.clear();
            
            if (ticketData.userToThread) {
                for (const [userId, threadId] of Object.entries(ticketData.userToThread)) {
                    this.userToThread.set(userId, threadId);
                }
            }
            
            if (ticketData.threadToUser) {
                for (const [threadId, userId] of Object.entries(ticketData.threadToUser)) {
                    this.threadToUser.set(threadId, userId);
                }
            }
            
            console.log(`[TICKET_PERSISTENCE] ✅ Loaded ${this.userToThread.size} active tickets from storage`);
            this.loaded = true;
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist yet, start with empty maps
                console.log('[TICKET_PERSISTENCE] 📝 No existing ticket file found, starting fresh');
                this.loaded = true;
            } else {
                console.error('[TICKET_PERSISTENCE] ❌ Error loading tickets:', error);
                // Continue with empty maps
                this.loaded = true;
            }
        }
    }

    // Save ticket mappings to file
    async saveTickets() {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(TICKETS_FILE);
            await fs.mkdir(dataDir, { recursive: true });
            
            // Convert Maps to objects for JSON serialization
            const ticketData = {
                userToThread: Object.fromEntries(this.userToThread),
                threadToUser: Object.fromEntries(this.threadToUser),
                lastUpdated: new Date().toISOString()
            };
            
            // Save to history file (append) to maintain all changes
            const historyFile = TICKETS_FILE.replace('.json', '_history.jsonl');
            await fs.appendFile(historyFile, JSON.stringify(ticketData) + '\n');
            
            // Write current state to main file (overwrite is intentional for current state)
            await fs.writeFile(TICKETS_FILE, JSON.stringify(ticketData, null, 2));
            console.log(`[TICKET_PERSISTENCE] 💾 Saved ${this.userToThread.size} active tickets to storage (history maintained)`);
            
        } catch (error) {
            console.error('[TICKET_PERSISTENCE] ❌ Error saving tickets:', error);
        }
    }

    // Add a new ticket mapping
    setTicket(userId, threadId) {
        this.userToThread.set(userId, threadId);
        this.threadToUser.set(threadId, userId);
        
        // Save immediately when tickets are added/changed
        this.saveTickets().catch(console.error);
    }

    // Remove a ticket mapping
    removeTicket(userId, threadId = null) {
        // If threadId is provided, use it. Otherwise, get it from the mapping
        if (!threadId) {
            threadId = this.userToThread.get(userId);
        }
        
        if (threadId) {
            this.userToThread.delete(userId);
            this.threadToUser.delete(threadId);
            
            // Save immediately when tickets are removed
            this.saveTickets().catch(console.error);
        }
    }

    // Get thread ID for a user
    getThreadForUser(userId) {
        return this.userToThread.get(userId);
    }

    // Get user ID for a thread
    getUserForThread(threadId) {
        return this.threadToUser.get(threadId);
    }

    // Check if user has an active ticket
    hasActiveTicket(userId) {
        return this.userToThread.has(userId);
    }

    // Get all active tickets
    getAllActiveTickets() {
        return {
            userToThread: Object.fromEntries(this.userToThread),
            threadToUser: Object.fromEntries(this.threadToUser)
        };
    }

    // Validate and cleanup orphaned tickets (threads that no longer exist)
    async cleanupOrphanedTickets(client) {
        console.log('[TICKET_PERSISTENCE] 🧹 Starting orphaned ticket cleanup...');
        let cleanupCount = 0;
        
        const threadsToRemove = [];
        
        for (const [threadId, userId] of this.threadToUser.entries()) {
            try {
                // Try to fetch the thread
                await client.channels.fetch(threadId);
                // Thread exists, keep it
            } catch (error) {
                // Thread doesn't exist or bot can't access it
                if (error.code === 10003 || error.code === 50001) { // Unknown Channel or Missing Access
                    console.log(`[TICKET_PERSISTENCE] 🗑️ Removing orphaned ticket: Thread ${threadId} for user ${userId}`);
                    threadsToRemove.push({ threadId, userId });
                    cleanupCount++;
                }
            }
        }
        
        // Remove orphaned tickets
        for (const { threadId, userId } of threadsToRemove) {
            this.userToThread.delete(userId);
            this.threadToUser.delete(threadId);
        }
        
        if (cleanupCount > 0) {
            await this.saveTickets();
            console.log(`[TICKET_PERSISTENCE] ✅ Cleaned up ${cleanupCount} orphaned tickets`);
        } else {
            console.log('[TICKET_PERSISTENCE] ✅ No orphaned tickets found');
        }
    }

    // Initialize and load tickets
    async initialize(client = null) {
        if (!this.loaded) {
            await this.loadTickets();
        }
        
        if (client) {
            // Run cleanup after a short delay to let the bot fully initialize
            setTimeout(() => {
                this.cleanupOrphanedTickets(client).catch(console.error);
            }, 5000);
        }
    }
}

// Create a singleton instance
const ticketPersistence = new TicketPersistence();

module.exports = ticketPersistence; 