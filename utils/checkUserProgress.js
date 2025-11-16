/**
 * Check User Progress Script
 * Displays current progress for all enrolled courses
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
require('dotenv').config();

async function checkUserProgress() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB\n');

    const users = await User.find({ 'enrolledCourses.0': { $exists: true } })
      .populate('enrolledCourses.course', 'title');

    for (const user of users) {
      console.log(`\n👤 User: ${user.email}`);
      console.log(`   Name: ${user.firstName} ${user.lastName}`);
      console.log(`   Enrolled in ${user.enrolledCourses.length} course(s)\n`);

      for (const enrollment of user.enrolledCourses) {
        const courseTitle = enrollment.course?.title || 'Unknown Course';
        console.log(`   📚 Course: ${courseTitle}`);
        console.log(`      Progress: ${enrollment.progress}%`);
        console.log(`      Completed: ${enrollment.completedModules}/${enrollment.totalModules} modules`);
        console.log(`      Status: ${enrollment.status}`);
        console.log(`      Last accessed: ${enrollment.lastAccessed ? enrollment.lastAccessed.toLocaleDateString() : 'Never'}`);
        
        if (enrollment.moduleProgress && enrollment.moduleProgress.length > 0) {
          const completedCount = enrollment.moduleProgress.filter(p => p.completed).length;
          console.log(`      Module progress entries: ${enrollment.moduleProgress.length} (${completedCount} completed)`);
          
          // Check for duplicates
          const moduleKeys = enrollment.moduleProgress.map(p => `${p.moduleId}-${p.subModuleId}`);
          const uniqueKeys = new Set(moduleKeys);
          if (moduleKeys.length !== uniqueKeys.size) {
            console.log(`      ⚠️  WARNING: ${moduleKeys.length - uniqueKeys.size} duplicate entries found!`);
          }
          
          // Check for progress over 100%
          if (enrollment.progress > 100) {
            console.log(`      ❌ ERROR: Progress is over 100%!`);
          }
        }
        console.log('');
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

checkUserProgress();
