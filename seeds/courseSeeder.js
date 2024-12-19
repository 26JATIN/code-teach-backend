const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Course = require('../models/Course');

const courses = [
  {
    title: 'Java Programming',
    description: 'Comprehensive course covering Java fundamentals, object-oriented programming, and advanced concepts.',
    difficulty: 'Beginner to Advanced',
    duration: '40',
    category: 'programming',
    path: '/modules/java',
    modules: [],
    enrollments: 0
  },
  {
    title: 'C++ Mastery',
    description: 'Deep dive into C++ programming, covering language intricacies, system-level programming, and best practices.',
    difficulty: 'Intermediate to Advanced',
    duration: '50',
    category: 'programming',
    path: '/modules/cpp'
  },
  {
    title: 'Data Structures & Algorithms',
    description: 'Comprehensive course on data structures, algorithm design, analysis, and problem-solving techniques.',
    difficulty: 'Advanced',
    duration: '60',
    category: 'programming',
    path: '/modules/dsa'
  },
  {
    title: 'Web Development Bootcamp',
    description: 'Full-stack web development course covering frontend, backend, and modern web technologies.',
    difficulty: 'Comprehensive',
    duration: '80',
    category: 'web',
    path: '/modules/web-development'
  }
];

async function seed() {
  try {
    console.log('MongoDB URI:', process.env.MONGODB_URI); // Add this line for debugging
    
    // Connect to MongoDB Atlas
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB Atlas');
    console.log('Database:', mongoose.connection.name);

    // First, delete all existing courses
    console.log('Clearing existing courses...');
    await Course.deleteMany({});
    console.log('Existing courses cleared');

    // Insert new courses
    console.log('Inserting new courses...');
    const insertedCourses = await Course.insertMany(courses);
    console.log(`Successfully inserted ${insertedCourses.length} courses`);

    // Log inserted courses
    insertedCourses.forEach(course => {
      console.log(`Inserted course: ${course.title} with ID: ${course._id}`);
    });

  } catch (error) {
    console.error('Seeding error:', error);
    throw error; // Propagate error to index.js
  } finally {
    // Close the connection
    if (mongoose.connection.readyState === 1) {
      console.log('Closing MongoDB connection...');
      await mongoose.connection.close();
    }
    process.exit(0);
  }
}

module.exports = { seed };

// Only run directly if this file is being run directly
if (require.main === module) {
  seed()
    .then(() => {
      console.log('Seeding completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}
