const User = require('../models/User');
const Course = require('../models/Course');
const mongoose = require('mongoose');

async function updateEnrollmentsAfterSeed() {
  try {
    console.log('Updating enrollment references...');
    
    // Get all courses
    const courses = await Course.find({});
    // Create lookup maps for each course
    const coursesByIndex = new Map();
    
    // Assuming courses are seeded in the same order, map by index
    courses.forEach((course, index) => {
      coursesByIndex.set(index, course._id);
    });
    
    const users = await User.find({ 'enrolledCourses.0': { $exists: true } });
    
    for (const user of users) {
      let updated = false;
      const validEnrollments = [];
      
      for (const enrollment of user.enrolledCourses) {
        // Get enrollment index based on order
        const enrollmentIndex = user.enrolledCourses.indexOf(enrollment);
        const courseId = coursesByIndex.get(enrollmentIndex);
        
        if (courseId) {
          console.log(`Mapping enrollment at index ${enrollmentIndex} to course ID: ${courseId}`);
          validEnrollments.push({
            ...enrollment.toObject(),
            course: courseId
          });
          updated = true;
        } else {
          console.log(`No matching course found for enrollment at index ${enrollmentIndex}`);
        }
      }
      
      if (updated) {
        user.enrolledCourses = validEnrollments;
        await user.save();
        console.log(`Updated enrollments for user ${user._id}`);
      }
    }
    
    console.log('Enrollment references update completed');
  } catch (error) {
    console.error('Error updating enrollments:', error);
    throw error;
  }
}

module.exports = { updateEnrollmentsAfterSeed };
