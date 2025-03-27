import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface Config {
  PORT: number;
  MONGODB_URI: string;
  DEFAULT_RETRY_ATTEMPTS: number;
  CRON_CHECK_INTERVAL: string;
}

// Function to determine if a MongoDB URI is valid
const isValidMongoURI = (uri: string): boolean => {
  // Basic validation - URI should start with mongodb:// or mongodb+srv://
  return uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://');
};

// Get the MongoDB URI, prioritizing environment variable
const getMongoURI = (): string => {
  const envURI = process.env.MONGODB_URI;

  // If environment variable is set and valid, use it
  if (envURI && isValidMongoURI(envURI)) {
    return envURI;
  }

  // Fallback to default local MongoDB
  return 'mongodb://localhost:27017/scheduler';
};

export const config: Config = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  MONGODB_URI: getMongoURI(),
  DEFAULT_RETRY_ATTEMPTS: parseInt(process.env.DEFAULT_RETRY_ATTEMPTS || '3', 10),
  CRON_CHECK_INTERVAL: process.env.CRON_CHECK_INTERVAL || '* * * * *',
};