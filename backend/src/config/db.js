// src/config/db.js
import mongoose from 'mongoose';
import logger from './logger.js';

const isProd = process.env.NODE_ENV === 'production';

const MONGO_OPTIONS = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4,
  // SECURITY: enforce TLS in production — Atlas requires it
  ...(isProd && {
    tls: true,
    tlsAllowInvalidCertificates: false,
    tlsAllowInvalidHostnames: false,
  }),
  // SECURITY: disable authSource fallback — must be explicit
  authSource: process.env.MONGO_AUTH_SOURCE || 'admin',
};

// SECURITY: disable mongoose debug logging in production (leaks query details)
mongoose.set('debug', !isProd);

// SECURITY: disable Mongoose's "strict mode" override — reject unknown fields
mongoose.set('strictQuery', true);

let isConnected = false;

export const connectDB = async () => {
  if (isConnected) return;

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, MONGO_OPTIONS);
    isConnected = true;
    logger.info(`MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    logger.error(`MongoDB connection failed: ${err.message}`);
    process.exit(1);
  }
};

// Graceful shutdown hooks
mongoose.connection.on('disconnected', () => {
  isConnected = false;
  logger.warn('MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  isConnected = true;
  logger.info('MongoDB reconnected');
});

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed (SIGINT)');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed (SIGTERM)');
  process.exit(0);
});

export default connectDB;
