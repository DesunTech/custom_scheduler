import mongoose from 'mongoose';
import { config } from '../utils/config';

export class DatabaseService {
  private static instance: DatabaseService;
  private isConnected = false;

  private constructor() {}

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Connect to MongoDB
   * Works with both local and cloud MongoDB by accepting a connection string
   */
  public async connect(connectionString?: string): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      const uri = connectionString || config.MONGODB_URI;

      if (!uri) {
        throw new Error('MongoDB connection string is not provided');
      }

      // Configure mongoose connection options for better stability
      const options = {
        autoIndex: true, // Build indexes
        maxPoolSize: 10, // Maintain up to 10 socket connections
        serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
        socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
        family: 4, // Use IPv4, skip trying IPv6
      };

      // Connect to MongoDB with the provided connection string
      await mongoose.connect(uri, options);

      this.isConnected = true;
      console.log('Connected to MongoDB');
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  /**
   * Disconnect from MongoDB
   */
  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await mongoose.disconnect();
      this.isConnected = false;
      console.log('Disconnected from MongoDB');
    } catch (error) {
      console.error('Failed to disconnect from MongoDB:', error);
      throw error;
    }
  }

  /**
   * Check if connected to MongoDB
   */
  public isConnectedToDatabase(): boolean {
    return this.isConnected;
  }

  /**
   * Get the current connection state
   */
  public getConnectionState(): number {
    return mongoose.connection.readyState;
  }
}