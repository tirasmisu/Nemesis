const mongoose = require('mongoose');
const { handleCommandError } = require('./errorManager');

class Database {
    constructor() {
        this.uri = process.env.MONGO_URI;
        this.options = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        };
        this.connectionAttempts = 0;
        this.maxRetries = 30;
    }

    async connect() {
        this.connectionAttempts++;
        
        try {
            console.log(`Database connection attempt ${this.connectionAttempts}/${this.maxRetries}`);
            
            if (!this.uri) {
                throw new Error('MongoDB URI is not defined in environment variables');
            }
            
            await mongoose.connect(this.uri, this.options);
            
            // Wait for the connection to be truly ready
            await new Promise((resolve, reject) => {
                if (mongoose.connection.readyState === 1) {
                    resolve();
                } else {
                    mongoose.connection.once('connected', resolve);
                    mongoose.connection.once('error', reject);
                    // Timeout after 10 seconds
                    setTimeout(() => reject(new Error('Database connection timeout')), 10000);
                }
            });
            
            console.log('✅ Connected to MongoDB successfully');
            
            // Reset connection attempts on successful connection
            this.connectionAttempts = 0;
            
            mongoose.connection.on('error', error => {
                console.error('MongoDB connection error:', error);
                handleCommandError(null, error, 'database error');
            });

            mongoose.connection.on('disconnected', () => {
                console.warn('⚠️  MongoDB disconnected. Attempting to reconnect...');
                if (this.connectionAttempts < this.maxRetries) {
                    setTimeout(() => this.connect(), 5000);
                } else {
                    console.error('❌ Max database reconnection attempts reached');
                }
            });

        } catch (error) {
            console.error(`❌ Failed to connect to MongoDB (attempt ${this.connectionAttempts}/${this.maxRetries}):`, error.message);
            
            if (this.connectionAttempts < this.maxRetries) {
                console.log(`⏳ Retrying connection in 5 seconds...`);
                setTimeout(() => this.connect(), 5000);
            } else {
                console.error('❌ Max database connection attempts reached. Bot will start without database.');
                throw error;
            }
        }
    }

    async disconnect() {
        try {
            await mongoose.disconnect();
            console.log('Disconnected from MongoDB');
        } catch (error) {
            console.error('Error disconnecting from MongoDB:', error);
            throw error;
        }
    }

    async validateConnection() {
        if (mongoose.connection.readyState !== 1) {
            throw new Error('Database connection not established');
        }
        
        // Test the connection by running a simple query
        try {
            await mongoose.connection.db.admin().ping();
            return true;
        } catch (error) {
            throw new Error(`Database connection validation failed: ${error.message}`);
        }
    }
}

module.exports = new Database();
