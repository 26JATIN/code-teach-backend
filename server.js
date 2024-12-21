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
let connectionAttempts = 0;
const MAX_RETRIES = 5;

// Modify the connection promise
const connectionPromise = new Promise((resolve, reject) => {
  let timeoutId;

  mongoose.connection.once('connected', () => {
    clearTimeout(timeoutId);
    dbConnected = true;
    connectionAttempts = 0;
    resolve(mongoose.connection);
  });

  mongoose.connection.once('error', (err) => {
    clearTimeout(timeoutId);
    reject(err);
  });

  // Add timeout to prevent hanging
  timeoutId = setTimeout(() => {
    reject(new Error('Connection timeout'));
  }, 30000);
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

    console.log('Connecting to MongoDB...');
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

    // Wait for connection to be fully established
    await connectionPromise;

    // Verify connection before proceeding
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Connection not established properly');
    }

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log('Database:', conn.connection.name);

    // Run cleanup after connection is verified
    if (dbConnected) {
      try {
        const { cleanupInvalidEnrollments } = require('./utils/dbCleanup');
        // Add small delay to ensure connection is stable
        await new Promise(resolve => setTimeout(resolve, 1000));
        await cleanupInvalidEnrollments();
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
        // Don't throw cleanup errors - log and continue
      }
    }

    return conn;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    connectionAttempts++;
    
    if (connectionAttempts >= MAX_RETRIES) {
      console.error('Max connection retries reached');
      throw error;
    }
    
    const retryDelay = Math.min(1000 * Math.pow(2, connectionAttempts), 60000);
    console.log(`Retrying connection in ${retryDelay/1000} seconds...`);
    await new Promise(resolve => setTimeout(resolve, retryDelay));
    return connectDB();
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
    // Wait for database connection
    const conn = await connectDB();
    
    // Double check connection state
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Database connection not established');
    }

    // Start server only after successful connection
    const server = await app.listen(port);
    console.log(`Server is running on port ${port}`);
    
    // Add server error handling
    server.on('error', (err) => {
      console.error('Server error:', err);
      process.exit(1);
    });

    return server;
  } catch (err) {
    console.error('Failed to start server:', err);
    if (err.code !== 'EADDRINUSE') {
      process.exit(1);
    }
    // Try next port if current is in use
    return startServer(port + 1);
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
