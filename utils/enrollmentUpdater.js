const User = require('../models/User');
const Course = require('../models/Course');
const mongoose = require('mongoose');

async function updateEnrollmentsAfterSeed() {
  try {
    console.log('Updating enrollment references...');
    
    // Get all courses with their titles
    const courses = await Course.find({}, { title: 1 });
    const coursesMap = new Map(courses.map(c => [c.title, c._id]));
    
    // Get all users with enrollments
    const users = await User.find({ 'enrolledCourses.0': { $exists: true } });
    
    for (const user of users) {
      let updated = false;
      const validEnrollments = [];
      
      for (const enrollment of user.enrolledCourses) {
        // Try to find corresponding course by title if course ref is null
        if (!enrollment.course) {
          // Get the old enrollment data for logging
          console.log('Processing enrollment:', JSON.stringify(enrollment, null, 2));
          
          // Find matching course by title from previous enrollment
          const matchedCourse = await Course.findOne({ title: "Java Programming" });
          
          if (matchedCourse) {
            console.log(`Found matching course: ${matchedCourse.title}`);
            validEnrollments.push({
              ...enrollment.toObject(),
              course: matchedCourse._id
            });
            updated = true;
          } else {
            console.log('No matching course found for enrollment');
          }
        } else {
          validEnrollments.push(enrollment);
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
