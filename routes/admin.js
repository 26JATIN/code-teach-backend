const express = require('express');
const router = express.Router();
const Course = require('../models/Course');
const User = require('../models/User');
const authenticateToken = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');
const mongoose = require('mongoose');

// Middleware to set CORS headers
const setCorsHeaders = (req, res, next) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept'
  });
  next();
};

// Apply CORS headers to all admin routes
router.use(setCorsHeaders);

// Apply authentication and admin middleware to all routes
router.use(authenticateToken, isAdmin);

// Get admin stats
router.get('/stats', async (req, res) => {
  try {
    const [totalUsers, totalCourses, recentUsers, recentCourses] = await Promise.all([
      User.countDocuments(),
      Course.countDocuments(),
      User.find().sort({ createdAt: -1 }).limit(5),
      Course.find().sort({ createdAt: -1 }).limit(5)
    ]);

    res.json({
      stats: {
        totalUsers,
        totalCourses
      },
      recentUsers,
      recentCourses
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Error fetching admin stats' });
  }
});

// Get all users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 }); // Sort by newest first
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all courses with detailed info
router.get('/courses', async (req, res) => {
  try {
    const courses = await Course.find().populate('enrolledUsers', 'username email');
    res.json(courses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new course with validation
router.post('/courses', async (req, res) => {
  try {
    const courseData = req.body;

    // Create course instance for validation
    const course = new Course(courseData);

    // Run validation
    const validationError = course.validateSync();
    if (validationError) {
      const errors = Object.values(validationError.errors).map(err => err.message);
      return res.status(400).json({ error: 'Validation failed', errors });
    }

    // Save course
    await course.save();

    res.status(201).json({
      message: 'Course created successfully',
      course
    });
  } catch (error) {
    console.error('Course creation error:', error);
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      res.status(400).json({
        error: `Duplicate ${field}. This ${field} is already in use.`
      });
    } else {
      res.status(500).json({
        error: 'Error creating course',
        details: error.message
      });
    }
  }
});

// Update course with validation
router.put('/courses/:id', async (req, res) => {
  try {
    const courseData = req.body;
    const courseId = req.params.id;

    // Check if course exists
    const existingCourse = await Course.findById(courseId);
    if (!existingCourse) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Validate update data
    const tempCourse = new Course(courseData);
    const validationError = tempCourse.validateSync();
    if (validationError) {
      const errors = Object.values(validationError.errors).map(err => err.message);
      return res.status(400).json({ error: 'Validation failed', errors });
    }

    // Update course
    const updatedCourse = await Course.findByIdAndUpdate(
      courseId,
      { $set: courseData },
      { new: true, runValidators: true }
    );

    res.json({
      message: 'Course updated successfully',
      course: updatedCourse
    });
  } catch (error) {
    console.error('Course update error:', error);
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      res.status(400).json({
        error: `Duplicate ${field}. This ${field} is already in use.`
      });
    } else {
      res.status(500).json({
        error: 'Error updating course',
        details: error.message
      });
    }
  }
});

// Delete course with cleanup
router.delete('/courses/:id', async (req, res) => {
  try {
    const courseId = req.params.id;

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Remove course from all user enrollments
    await User.updateMany(
      { 'enrolledCourses.course': courseId },
      { $pull: { enrolledCourses: { course: courseId } } }
    );

    // Delete the course
    await Course.findByIdAndDelete(courseId);

    res.json({
      message: 'Course deleted successfully',
      courseId
    });
  } catch (error) {
    console.error('Course deletion error:', error);
    res.status(500).json({
      error: 'Error deleting course',
      details: error.message
    });
  }
});

// Get course with modules
router.get('/courses/:id/modules', async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.json({
      courseId: course._id,
      title: course.title,
      modules: course.modules || []
    });
  } catch (error) {
    console.error('Error fetching course modules:', error);
    res.status(500).json({ error: 'Error fetching course modules' });
  }
});

// Add or update modules for a course
router.post('/courses/:id/modules', async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const { modules } = req.body;
    
    // Validate modules structure
    const tempCourse = new Course({
      ...course.toObject(),
      modules
    });
    
    const validationError = tempCourse.validateSync();
    if (validationError) {
      const errors = Object.values(validationError.errors).map(err => err.message);
      return res.status(400).json({ error: 'Module validation failed', errors });
    }

    course.modules = modules;
    await course.save();

    res.json({
      message: 'Modules updated successfully',
      courseId: course._id,
      modules: course.modules
    });
  } catch (error) {
    console.error('Error updating course modules:', error);
    res.status(500).json({
      error: 'Error updating course modules',
      details: error.message
    });
  }
});

// Delete a specific module
router.delete('/courses/:id/modules/:moduleIndex', async (req, res) => {
  try {
    const { id, moduleIndex } = req.params;
    const course = await Course.findById(id);
    
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    if (!course.modules || moduleIndex >= course.modules.length) {
      return res.status(404).json({ error: 'Module not found' });
    }

    course.modules.splice(moduleIndex, 1);
    await course.save();

    res.json({
      message: 'Module deleted successfully',
      courseId: course._id,
      remainingModules: course.modules
    });
  } catch (error) {
    console.error('Error deleting module:', error);
    res.status(500).json({
      error: 'Error deleting module',
      details: error.message
    });
  }
});

// Get user enrollments
router.get('/enrollments', async (req, res) => {
  try {
    const courses = await Course.find().populate('enrolledUsers', 'username email');
    res.json(courses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Don't allow deleting admin users
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.email === process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Cannot delete admin user' });
    }

    await User.findByIdAndDelete(userId);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get course modules - Add this route
router.get('/courses/:courseId/modules', async (req, res) => {
  try {
    const { courseId } = req.params;
    console.log('Fetching modules for course:', courseId);

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({
        error: 'Invalid course ID',
        details: 'The provided course ID is not valid'
      });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        error: 'Course not found',
        details: 'No course exists with the provided ID'
      });
    }

    res.json({
      modules: course.modules || [],
      count: course.modules?.length || 0,
      courseId: course._id,
      courseTitle: course.title
    });
  } catch (error) {
    console.error('Error fetching modules:', error);
    res.status(500).json({
      error: 'Error fetching modules',
      details: error.message
    });
  }
});

// Update modules - Add this route
router.put('/courses/:courseId/modules', async (req, res) => {
  try {
    const { courseId } = req.params;
    const { modules } = req.body;

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    course.modules = modules;
    await course.save();

    res.json({
      message: 'Modules updated successfully',
      modules: course.modules
    });
  } catch (error) {
    console.error('Error updating modules:', error);
    res.status(500).json({
      error: 'Error updating modules',
      details: error.message
    });
  }
});

module.exports = router;
