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

// Add a connection promise to track connection status
let dbConnected = false;
const connectionPromise = new Promise((resolve, reject) => {
  mongoose.connection.once('connected', () => {
    dbConnected = true;
    resolve();
  });
  mongoose.connection.once('error', (err) => {
    reject(err);
  });
});

// MongoDB Connection
const connectDB = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      console.log('MongoDB is already connected');
      return mongoose.connection;
    }

    // Clear any existing connections
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }

    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000,
      heartbeatFrequencyMS: 2000,
      maxPoolSize: 10,
      minPoolSize: 5,
      socketTimeoutMS: 45000,
      family: 4
    });

    // Wait for the connection to be fully established
    await connectionPromise;
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log('Database:', conn.connection.name);
    
    // Only run cleanup after connection is fully established
    if (dbConnected) {
      console.log('Running enrollment cleanup...');
      try {
        const { cleanupInvalidEnrollments } = require('./utils/dbCleanup');
        await cleanupInvalidEnrollments();
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }
    
    return conn;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    if (error.name === 'MongoServerSelectionError') {
      console.error('Could not connect to MongoDB servers');
    }
    throw error;
  }
};

// Initialize DB connection
connectDB();

// Enhanced connection event handlers
mongoose.connection.on('connecting', () => {
  console.log('Connecting to MongoDB...');
});

mongoose.connection.on('connected', async () => {
  console.log('Successfully connected to MongoDB');
  mongoose.connection.retryCount = 0;
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
  dbConnected = false;
  // Only attempt reconnection if we're not already connecting
  if (mongoose.connection.readyState !== 2) {
    const retryDelay = Math.min(1000 * Math.pow(2, mongoose.connection.retryCount || 0), 60000);
    console.log(`Attempting to reconnect in ${retryDelay/1000} seconds...`);
    setTimeout(() => {
      mongoose.connection.retryCount = (mongoose.connection.retryCount || 0) + 1;
      connectDB().catch(console.error);
    }, retryDelay);
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
    // Ensure database is connected before starting server
    await connectDB();
    await connectionPromise; // Wait for full connection

    if (!dbConnected) {
      throw new Error('Database connection not established');
    }

    await app.listen(port);
    console.log(`Server is running on port ${port}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
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
