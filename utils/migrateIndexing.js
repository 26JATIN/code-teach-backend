/**
 * Migration Script: Repair Course Indexing
 * 
 * This script:
 * 1. Indexes all courses in the database
 * 2. Updates all user enrollments with proper progress tracking
 * 3. Fixes any inconsistencies in course structure
 * 
 * Usage: node utils/migrateIndexing.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Course = require('../models/Course');
const User = require('../models/User');
const {
  indexCourseModules,
  updateUserProgressForCourseChange,
  validateAndRepairCourseIndexing
} = require('./courseIndexing');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Migrate all courses
const migrateCourses = async () => {
  try {
    console.log('\n📚 Starting course indexing migration...\n');

    const courses = await Course.find({});
    console.log(`Found ${courses.length} courses to process\n`);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const course of courses) {
      try {
        console.log(`Processing: ${course.title} (${course._id})`);
        
        // Validate and repair indexing
        const result = await validateAndRepairCourseIndexing(course._id);
        
        console.log(`  ✓ Indexed: ${result.indexing.totalModules} modules, ${result.indexing.totalSubModules} submodules`);
        console.log(`  ✓ Updated progress for ${result.progressUpdate.usersUpdated} users`);
        
        successCount++;
      } catch (error) {
        console.error(`  ✗ Error: ${error.message}`);
        errorCount++;
        errors.push({
          courseId: course._id,
          title: course.title,
          error: error.message
        });
      }
      console.log('');
    }

    // Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('MIGRATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total courses: ${courses.length}`);
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    
    if (errors.length > 0) {
      console.log('\n⚠️  ERRORS:');
      errors.forEach((err, index) => {
        console.log(`${index + 1}. ${err.title} (${err.courseId})`);
        console.log(`   ${err.error}`);
      });
    }

    console.log('═══════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

// Verify enrollments
const verifyEnrollments = async () => {
  try {
    console.log('🔍 Verifying user enrollments...\n');

    const users = await User.find({ 'enrollments.0': { $exists: true } }).populate('enrollments.course');
    console.log(`Found ${users.length} users with enrollments\n`);

    let invalidEnrollments = 0;
    let validEnrollments = 0;

    for (const user of users) {
      for (const enrollment of user.enrollments) {
        if (!enrollment.course) {
          console.log(`⚠️  User ${user.username} (${user._id}): Invalid course reference`);
          invalidEnrollments++;
        } else {
          validEnrollments++;
        }
      }
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('ENROLLMENT VERIFICATION');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total enrollments: ${validEnrollments + invalidEnrollments}`);
    console.log(`✅ Valid: ${validEnrollments}`);
    console.log(`❌ Invalid: ${invalidEnrollments}`);
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Enrollment verification failed:', error);
  }
};

// Clean up invalid enrollments
const cleanupInvalidEnrollments = async () => {
  try {
    console.log('🧹 Cleaning up invalid enrollments...\n');

    const users = await User.find({ 'enrollments.0': { $exists: true } });
    let cleanedCount = 0;

    for (const user of users) {
      const originalLength = user.enrollments.length;
      
      // Remove enrollments where course doesn't exist
      const validEnrollments = [];
      for (const enrollment of user.enrollments) {
        const courseExists = await Course.exists({ _id: enrollment.course });
        if (courseExists) {
          validEnrollments.push(enrollment);
        } else {
          console.log(`  Removing invalid enrollment for user ${user.username}`);
          cleanedCount++;
        }
      }

      if (validEnrollments.length !== originalLength) {
        user.enrollments = validEnrollments;
        await user.save();
      }
    }

    console.log(`✅ Cleaned up ${cleanedCount} invalid enrollments\n`);

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  }
};

// Main execution
const main = async () => {
  try {
    await connectDB();
    
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║     COURSE INDEXING MIGRATION & REPAIR TOOL           ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    // Step 1: Migrate courses
    await migrateCourses();

    // Step 2: Verify enrollments
    await verifyEnrollments();

    // Step 3: Cleanup invalid enrollments (optional)
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question('Clean up invalid enrollments? (yes/no): ', async (answer) => {
      if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
        await cleanupInvalidEnrollments();
      }

      console.log('✨ Migration complete!\n');
      readline.close();
      mongoose.connection.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    mongoose.connection.close();
    process.exit(1);
  }
};

// Run migration
main();
