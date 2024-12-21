const User = require('../models/User');
const Course = require('../models/Course');

async function cleanupInvalidEnrollments() {
  try {
    // Find all users with enrolled courses
    const users = await User.find({ 'enrolledCourses.0': { $exists: true } });
    
    for (const user of users) {
      const validEnrollments = [];
      
      for (const enrollment of user.enrolledCourses) {
        // Check if course exists
        const courseExists = await Course.exists({ _id: enrollment.course });
        if (courseExists) {
          validEnrollments.push(enrollment);
        } else {
          console.log(`Removing invalid enrollment for user ${user._id}, course ${enrollment.course}`);
        }
      }
      
      // Update user if enrollments changed
      if (validEnrollments.length !== user.enrolledCourses.length) {
        user.enrolledCourses = validEnrollments;
        await user.save();
        console.log(`Updated enrollments for user ${user._id}`);
      }
    }
  } catch (error) {
    console.error('Error cleaning up enrollments:', error);
  }
}

module.exports = { cleanupInvalidEnrollments };
