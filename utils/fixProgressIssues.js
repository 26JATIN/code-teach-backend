/**
 * Fix Progress Over 100% Issue
 * 
 * This script fixes users who have progress > 100% by:
 * 1. Removing duplicate progress entries
 * 2. Recalculating progress with proper cap at 100%
 * 3. Validating totalModules count
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course'); // Load Course model to prevent schema error
require('dotenv').config();

async function fixProgressIssues() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');

    // Find all users with enrollments
    const users = await User.find({ 'enrolledCourses.0': { $exists: true } });
    console.log(`Found ${users.length} users with enrollments`);

    let fixedCount = 0;
    let issuesFound = 0;

    for (const user of users) {
      let userModified = false;

      for (const enrollment of user.enrolledCourses) {
        const originalProgress = enrollment.progress;
        
        // Check for issues
        if (enrollment.progress > 100) {
          issuesFound++;
          console.log(`\n❌ User ${user.email} - Course ${enrollment.course}`);
          console.log(`   Progress: ${enrollment.progress}%`);
          console.log(`   Completed: ${enrollment.completedModules}/${enrollment.totalModules}`);
        }

        // 1. Remove duplicate progress entries
        if (enrollment.moduleProgress && enrollment.moduleProgress.length > 0) {
          const uniqueProgress = new Map();
          const originalLength = enrollment.moduleProgress.length;
          
          enrollment.moduleProgress.forEach(p => {
            const key = `${p.moduleId}-${p.subModuleId}`;
            if (!uniqueProgress.has(key) || p.completed) {
              uniqueProgress.set(key, p);
            }
          });
          
          enrollment.moduleProgress = Array.from(uniqueProgress.values());
          
          if (originalLength !== enrollment.moduleProgress.length) {
            console.log(`   Removed ${originalLength - enrollment.moduleProgress.length} duplicate entries`);
            userModified = true;
          }
        }

        // 2. Recalculate completion stats
        enrollment.completedModules = enrollment.moduleProgress.filter(p => p.completed).length;
        
        // 3. Cap progress at 100%
        if (enrollment.totalModules > 0) {
          const newProgress = Math.min(100, Math.round((enrollment.completedModules / enrollment.totalModules) * 100));
          
          if (newProgress !== originalProgress) {
            console.log(`   Fixed progress: ${originalProgress}% → ${newProgress}%`);
            enrollment.progress = newProgress;
            userModified = true;
          }
        } else {
          if (enrollment.progress !== 0) {
            console.log(`   Fixed progress (no modules): ${originalProgress}% → 0%`);
            enrollment.progress = 0;
            userModified = true;
          }
        }
      }

      // Save if modified
      if (userModified) {
        await user.save();
        fixedCount++;
        console.log(`   ✅ Fixed and saved`);
      }
    }

    console.log(`\n========================================`);
    console.log(`Summary:`);
    console.log(`  Total users checked: ${users.length}`);
    console.log(`  Issues found: ${issuesFound}`);
    console.log(`  Users fixed: ${fixedCount}`);
    console.log(`========================================\n`);

  } catch (error) {
    console.error('Error fixing progress issues:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the fix
fixProgressIssues();
