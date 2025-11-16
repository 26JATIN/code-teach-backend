/**
 * Progress Tracking Routes
 * Handles user progress tracking for courses
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  initializeEnrollmentProgress,
  updateSubModuleProgress,
  getUserCourseProgress,
  validateAndRepairCourseIndexing
} = require('../utils/courseIndexing');

/**
 * POST /api/progress/enroll/:courseId
 * Enroll user in a course with proper progress tracking
 */
router.post('/enroll/:courseId', auth, async (req, res) => {
  try {
    const result = await initializeEnrollmentProgress(
      req.user.userId,
      req.params.courseId
    );

    res.json({
      success: true,
      message: result.alreadyEnrolled 
        ? 'Already enrolled in this course' 
        : 'Successfully enrolled in course',
      data: result
    });
  } catch (error) {
    console.error('Enrollment error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PUT /api/progress/:courseId/module/:moduleId/submodule/:subModuleId
 * Mark a submodule as completed
 */
router.put('/:courseId/module/:moduleId/submodule/:subModuleId', auth, async (req, res) => {
  try {
    const { courseId, moduleId, subModuleId } = req.params;
    
    const result = await updateSubModuleProgress(
      req.user.userId,
      courseId,
      moduleId,
      subModuleId
    );

    res.json({
      success: true,
      message: 'Progress updated successfully',
      data: result
    });
  } catch (error) {
    console.error('Progress update error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/progress/:courseId
 * Get user's progress for a specific course
 */
router.get('/:courseId', auth, async (req, res) => {
  try {
    const progress = await getUserCourseProgress(
      req.user.userId,
      req.params.courseId
    );

    res.json({
      success: true,
      data: progress
    });
  } catch (error) {
    console.error('Get progress error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/progress/repair/:courseId
 * Admin only - Validate and repair course indexing
 */
router.post('/repair/:courseId', auth, async (req, res) => {
  try {
    // Check if user is admin (you'll need to add this to your auth middleware)
    const User = require('../models/User');
    const user = await User.findById(req.user.userId);
    
    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const result = await validateAndRepairCourseIndexing(req.params.courseId);

    res.json({
      success: true,
      message: 'Course indexing validated and repaired',
      data: result
    });
  } catch (error) {
    console.error('Repair error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/progress/user/all
 * Get all courses progress for current user
 */
router.get('/user/all', auth, async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user.userId).populate('enrollments.course');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const progressData = user.enrollments.map(enrollment => ({
      course: {
        _id: enrollment.course._id,
        title: enrollment.course.title,
        shortName: enrollment.course.shortName,
        thumbnail: enrollment.course.thumbnail,
        icon: enrollment.course.icon,
        color: enrollment.course.color
      },
      progress: enrollment.progress,
      completedModules: enrollment.completedModules,
      totalModules: enrollment.totalModules,
      enrolledAt: enrollment.enrolledAt,
      lastAccessed: enrollment.lastAccessed,
      recentActivity: enrollment.moduleProgress
        .filter(p => p.lastVisited && !p.archived)
        .sort((a, b) => b.lastVisited - a.lastVisited)
        .slice(0, 3)
    }));

    res.json({
      success: true,
      data: progressData
    });
  } catch (error) {
    console.error('Get all progress error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
