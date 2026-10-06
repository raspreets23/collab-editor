import mongoose from 'mongoose';

/**
 * Connect to MongoDB database using Mongoose.
 * Reads connection URI from MONGO_URI environment variable.
 */
export const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/collab_editor';
    
    // Configure mongoose connection options
    const conn = await mongoose.connect(mongoUri);

    console.log(`[Database] MongoDB connected successfully: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`[Database Error] Failed to connect to MongoDB: ${error.message}`);
    // We do not forcibly exit the process here so that development/test environments
    // can provide meaningful feedback, but in production this should be monitored.
    throw error;
  }
};

export default connectDB;

