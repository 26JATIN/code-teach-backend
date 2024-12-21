const User = require('../models/User');
const Course = require('../models/Course');
const mongoose = require('mongoose');

async function cleanupInvalidEnrollments() {
  try {
    console.log('Starting enrollment cleanup...');
    const users = await User.find({ 'enrolledCourses.0': { $exists: true } })
      .populate('enrolledCourses.course');
    
    let totalCleaned = 0;

    for (const user of users) {
      console.log(`Checking enrollments for user ${user._id}`);
      console.log('Current enrollments:', JSON.stringify(user.enrolledCourses, null, 2));

      // Filter valid enrollments with more detailed logging
      const validEnrollments = [];
      for (const enrollment of user.enrolledCourses) {
        // Skip if course is null or undefined
        if (!enrollment.course) {
          console.log(`Found null course reference in enrollment: ${enrollment._id}`);
          continue;
        }

        // Verify course still exists in database
        try {
          const courseExists = await Course.findById(
            typeof enrollment.course === 'object' ? enrollment.course._id : enrollment.course
          );
          
          if (courseExists) {
            validEnrollments.push({
              ...enrollment.toObject(),
              course: courseExists._id // Ensure we store just the ID
            });
          } else {
            console.log(`Course not found in database: ${enrollment.course}`);
          }
        } catch (err) {
          console.error(`Error verifying course: ${err.message}`);
        }
      }

      // Only update if there are changes
      if (validEnrollments.length !== user.enrolledCourses.length) {
        console.log(`User ${user._id}:`);
        console.log(`- Before cleanup: ${user.enrolledCourses.length} enrollments`);
        console.log(`- After cleanup: ${validEnrollments.length} enrollments`);
        
        // Update with valid enrollments
        user.enrolledCourses = validEnrollments;
        await user.save();
        
        totalCleaned += (user.enrolledCourses.length - validEnrollments.length);
      }
    }

    console.log(`Cleanup completed: Removed ${totalCleaned} invalid enrollments`);
    return totalCleaned;
  } catch (error) {
    console.error('Error during cleanup:', error);
    throw error;
  }
}

module.exports = { cleanupInvalidEnrollments };
