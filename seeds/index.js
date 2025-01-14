const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Course = require('../models/Course');
const { seedCourses } = require('./courseSeeder');  // Update import

async function clearDatabase() {
  try {
    console.log('Clearing existing data...');
    await Course.deleteMany({});
    console.log('Database cleared');
  } catch (error) {
    console.error('Error clearing database:', error);
    throw error;
  }
}

async function seedDatabase() {
  try {
    console.log('Starting database seeding...');
    console.log('MongoDB URI:', process.env.MONGODB_URI); // Add this line for debugging
    
    // Connect to MongoDB Atlas
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB Atlas');
    
    // Clear existing data
    await clearDatabase();
    
    // Call seedCourses directly instead of .seed()
    await seedCourses();
    
    console.log('Seeding completed successfully');
    
  } catch (error) {
    console.error('Seeding failed:', error);
  } finally {
    // Close connection
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(0);
  }
}

// Run seeder if this file is executed directly
if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
