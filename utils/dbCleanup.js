const User = require('../models/User');
const Course = require('../models/Course');
const mongoose = require('mongoose');

async function cleanupInvalidEnrollments() {
  try {
    // Find all users with enrolled courses
    const users = await User.find({ 'enrolledCourses.0': { $exists: true } });
    let totalCleaned = 0;

    for (const user of users) {
      const validEnrollments = [];
      
      for (const enrollment of user.enrolledCourses) {
        try {
          // Make sure we have a valid course ID
          if (!enrollment.course || !mongoose.Types.ObjectId.isValid(enrollment.course)) {
            console.log(`Invalid course ID format for enrollment:`, enrollment);
            continue;
          }

          // Check if course exists
          const course = await Course.findById(enrollment.course);
          if (course) {
            validEnrollments.push(enrollment);
          } else {
            console.log(`Course not found for ID: ${enrollment.course}`);
          }
        } catch (err) {
          console.error(`Error checking course ${enrollment.course}:`, err);
        }
      }
      
      // Update user if enrollments changed
      if (validEnrollments.length !== user.enrolledCourses.length) {
        console.log(`Before cleanup - User ${user._id} had ${user.enrolledCourses.length} enrollments`);
        user.enrolledCourses = validEnrollments;
        await user.save();
        console.log(`After cleanup - User ${user._id} now has ${validEnrollments.length} enrollments`);
        totalCleaned += (user.enrolledCourses.length - validEnrollments.length);
      }
    }
    
    console.log(`Cleanup completed. Removed ${totalCleaned} invalid enrollments`);
  } catch (error) {
    console.error('Error in cleanupInvalidEnrollments:', error);
  }
}

module.exports = { cleanupInvalidEnrollments };
