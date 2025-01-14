const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// CORS configuration
const allowedOrigins = [
  'https://code-teach.vercel.app',
  'https://code-teach-backend.vercel.app/'
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

// Add connection state tracking with better timeout handling
let connectionTimeout;
let dbConnected = false;
let connectionAttempts = 0;
const MAX_RETRIES = 3;
const INITIAL_TIMEOUT = 5000;

// Create a more robust connection promise
const createConnectionPromise = () => {
  return new Promise((resolve, reject) => {
    // Clear any existing timeout
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
    }

    // Set new timeout
    connectionTimeout = setTimeout(() => {
      if (mongoose.connection.readyState !== 1) {
        mongoose.connection.close();
        reject(new Error('Connection attempt timed out'));
      }
    }, INITIAL_TIMEOUT);

    const cleanup = () => {
      clearTimeout(connectionTimeout);
      mongoose.connection.removeListener('connected', onConnect);
      mongoose.connection.removeListener('error', onError);
    };

    const onConnect = () => {
      cleanup();
      dbConnected = true;
      connectionAttempts = 0;
      resolve(mongoose.connection);
    };

    const onError = (err) => {
      cleanup();
      reject(err);
    };

    mongoose.connection.once('connected', onConnect);
    mongoose.connection.once('error', onError);
  });
};

// Update MongoDB Connection function
const connectDB = async () => {
  try {
    // Check existing connection
    if (mongoose.connection.readyState === 1) {
      console.log('MongoDB is already connected');
      return mongoose.connection;
    }

    // Close any pending connections
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }

    console.log(`Connection attempt ${connectionAttempts + 1}/${MAX_RETRIES}`);

    // Configure connection options
    const connectOptions = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: INITIAL_TIMEOUT,
      heartbeatFrequencyMS: 2000,
      maxPoolSize: 10,
      minPoolSize: 5,
      socketTimeoutMS: 45000,
      family: 4,
      autoIndex: false,
      maxConnecting: 1,
      connectTimeoutMS: INITIAL_TIMEOUT,
    };

    // Create connection promise before connecting
    const connectionPromise = createConnectionPromise();

    // Connect to MongoDB
    const mongooseConnection = await mongoose.connect(process.env.MONGODB_URI, connectOptions);

    // Wait for connection to be established
    await connectionPromise;

    // Get connection info safely
    const host = mongoose.connection.host || mongooseConnection.connection.host || 'unknown';
    const dbName = mongoose.connection.name || mongooseConnection.connection.name || 'unknown';

    console.log(`MongoDB Connected: ${host}`);
    console.log('Database:', dbName);

    return mongoose.connection;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    
    if (connectionAttempts >= MAX_RETRIES - 1) {
      console.error('Max connection retries reached');
      throw new Error('Failed to connect to MongoDB after maximum retries');
    }

    connectionAttempts++;
    const retryDelay = Math.min(1000 * Math.pow(2, connectionAttempts), 10000);
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
app.use('/api/contact', require('./routes/contact'));

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

// Update server startup
const startServer = async (port) => {
  let server;
  try {
    // Attempt connection with timeout
    const timeoutDuration = 30000;
    const connectPromise = connectDB();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Initial connection timeout')), timeoutDuration);
    });

    await Promise.race([connectPromise, timeoutPromise]);

    // Double check connection state
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Database connection not established');
    }

    // Wait a bit to ensure connection is stable
    await new Promise(resolve => setTimeout(resolve, 1000));

    server = await app.listen(port);
    console.log(`Server is running on port ${port}`);

    return server;
  } catch (err) {
    console.error('Failed to start server:', err);
    if (server) server.close();
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
