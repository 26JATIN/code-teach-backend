const express = require('express');
const router = express.Router();
const Course = require('../models/Course');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
      }
      req.user = decoded;
      next();
    });
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Get all courses
router.get('/', async (req, res) => {
  try {
    const courses = await Course.find({});
    res.json(courses);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching courses' });
  }
});

// Enroll in a course
router.post('/enroll/:courseId', authenticateToken, async (req, res) => {
  try {
    const courseId = req.params.courseId;
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Check if already enrolled
    const isEnrolled = user.enrolledCourses.some(
      enrollment => enrollment.course.toString() === courseId
    );

    if (isEnrolled) {
      return res.status(400).json({ error: 'Already enrolled in this course' });
    }

    // Add course to user's enrolled courses
    await user.enrollInCourse(courseId);

    // Generate new token with updated user data
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Successfully enrolled in course',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        enrolledCourses: user.getEnrolledCourses()
      }
    });

  } catch (error) {
    console.error('Enrollment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add this new route for unenrolling
router.delete('/enroll/:courseId', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Find and remove the enrolled course
    const courseIndex = user.enrolledCourses.findIndex(
      enrollment => enrollment.course.toString() === req.params.courseId
    );

    if (courseIndex === -1) {
      return res.status(404).json({ error: 'Course enrollment not found' });
    }

    // Remove the course from enrolledCourses array
    user.enrolledCourses.splice(courseIndex, 1);
    await user.save();

    res.json({ message: 'Successfully unenrolled from course' });
  } catch (error) {
    console.error('Unenrollment error:', error);
    res.status(500).json({ error: 'Error unenrolling from course' });
  }
});

// Get enrolled courses for user
router.get('/enrolled', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .populate('enrolledCourses.course');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const enrolledCourses = user.enrolledCourses
      .filter(enrollment => enrollment.course) // Filter out any null references
      .map(enrollment => {
        const course = enrollment.course;
        return {
          _id: course._id,
          courseId: course._id, // Add for backwards compatibility
          title: course.title,
          description: course.description,
          difficulty: course.difficulty,
          duration: course.duration,
          category: course.category,
          path: course.path,
          progress: enrollment.progress,
          enrolledAt: enrollment.enrolledAt
        };
      });

    console.log('Sending enrolled courses:', JSON.stringify(enrolledCourses, null, 2));
    res.json(enrolledCourses);
  } catch (error) {
    console.error('Error fetching enrolled courses:', error);
    res.status(500).json({ error: 'Error fetching enrolled courses' });
  }
});

// Update course progress
router.put('/progress/:courseId', authenticateToken, async (req, res) => {
  try {
    const { progress } = req.body;
    const user = await User.findById(req.user.userId);
    
    const courseEnrollment = user.enrolledCourses.find(
      enrollment => enrollment.course.toString() === req.params.courseId
    );

    if (!courseEnrollment) {
      return res.status(404).json({ error: 'Course enrollment not found' });
    }

    courseEnrollment.progress = progress;
    await user.save();

    res.json({ message: 'Progress updated successfully', progress });
  } catch (error) {
    res.status(500).json({ error: 'Error updating progress' });
  }
});

module.exports = router;
