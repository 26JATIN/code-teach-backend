const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// CORS configuration
const allowedOrigins = [
  'https://code-teach.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'https://code-teach-backend.onrender.com',
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    // Check if the origin is allowed
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return allowedOrigin === origin;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Origin',
    'Accept',
    'X-Requested-With',
    'ngrok-skip-browser-warning'
  ],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400 // 24 hours
};

// Apply CORS middleware
app.use(cors(corsOptions));

app.use(express.json());

// MongoDB Connection
const connectDB = async () => {
  try {
    // Check if already connected
    if (mongoose.connection.readyState === 1) {
      console.log('MongoDB is already connected');
      return;
    }

    // Clear any existing connections
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }

    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      retryWrites: true,
      w: 'majority',
      // Remove these as they're deprecated in newer versions
      // autoReconnect: true,
      // reconnectTries: Number.MAX_VALUE,
      // reconnectInterval: 1000,
      
      // Add these instead
      serverSelectionTimeoutMS: 30000, // Increase timeout to 30 seconds
      heartbeatFrequencyMS: 2000,
      maxPoolSize: 10,
      minPoolSize: 5,
      socketTimeoutMS: 45000,
      family: 4 // Use IPv4, skip trying IPv6
    });
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log('Database:', conn.connection.name);
    
    return conn;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    // Add more detailed error logging
    if (error.name === 'MongoServerSelectionError') {
      console.error('Could not connect to any MongoDB servers');
      console.error('Connection string:', process.env.MONGODB_URI.replace(/:([^:@]{8})[^:@]*@/, ':****@'));
    }
    
    // Retry with increasing delay
    const retryDelay = Math.min(1000 * Math.pow(2, mongoose.connection.retryCount || 0), 60000);
    console.log(`Retrying connection in ${retryDelay/1000} seconds...`);
    setTimeout(connectDB, retryDelay);
  }
};

// Initialize DB connection
connectDB();

// Enhanced connection event handlers
mongoose.connection.on('connecting', () => {
  console.log('Connecting to MongoDB...');
});

const { cleanupInvalidEnrollments } = require('./utils/dbCleanup');

mongoose.connection.on('connected', async () => {
  console.log('Successfully connected to MongoDB');
  mongoose.connection.retryCount = 0;
  
  // Run cleanup on connection
  console.log('Running enrollment cleanup...');
  await cleanupInvalidEnrollments();
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
  // Only disconnect if we're not already disconnected
  if (mongoose.connection.readyState !== 0) {
    mongoose.disconnect();
  }
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
  mongoose.connection.retryCount = (mongoose.connection.retryCount || 0) + 1;
  // Only attempt reconnection if we're not already connecting
  if (mongoose.connection.readyState !== 2) {
    console.log('Attempting to reconnect...');
    setTimeout(connectDB, 5000);
  }
});

// Add this new event listener for handling initial connection errors
mongoose.connection.on('reconnectFailed', () => {
  console.error('MongoDB reconnection failed after maximum retries');
  process.exit(1); // Exit the process to allow container/process manager to restart
});

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/api/courses', require('./routes/courses'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error details:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body
  });
  
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Wait for database connection before starting server
const startServer = async (port) => {
  try {
    // Wait for database connection first
    await connectDB();
    
    // Only start server if database is connected
    if (mongoose.connection.readyState === 1) {
      await app.listen(port);
      console.log(`Server is running on port ${port}`);
    } else {
      throw new Error('Database connection not ready');
    }
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is busy, trying ${port + 1}`);
      startServer(port + 1);
    } else {
      console.error('Error starting server:', err);
      process.exit(1);
    }
  }
};

// Change default port to explicitly use 5000
const PORT = process.env.PORT || 5000;
startServer(PORT);

// Graceful shutdown
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed through app termination');
    process.exit(0);
  } catch (err) {
    console.error('Error during graceful shutdown:', err);
    process.exit(1);
  }
});
