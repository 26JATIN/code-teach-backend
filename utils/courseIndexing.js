/**
 * Course Indexing and Progress Management System
 * 
 * This module provides robust indexing for courses and handles:
 * - Module and submodule ordering
 * - Progress tracking updates when course structure changes
 * - Enrollment cleanup when courses are deleted
 * - Automatic reindexing on course updates
 */

const mongoose = require('mongoose');

/**
 * Generate unique IDs for modules and submodules
 * This ensures consistent tracking even if order changes
 */
const generateModuleId = (courseId, moduleOrder) => {
  return `${courseId}_module_${moduleOrder}`;
};

const generateSubModuleId = (courseId, moduleOrder, subModuleOrder) => {
  return `${courseId}_module_${moduleOrder}_sub_${subModuleOrder}`;
};

/**
 * Index all modules and submodules in a course
 * Assigns unique IDs and proper ordering
 */
const indexCourseModules = (course) => {
  if (!course.modules || !Array.isArray(course.modules)) {
    return {
      totalModules: 0,
      totalSubModules: 0,
      indexed: []
    };
  }

  let totalSubModules = 0;
  const indexed = [];

  course.modules.forEach((module, moduleIndex) => {
    // Assign module ID and order
    module.id = module.id || generateModuleId(course._id, moduleIndex + 1);
    module.order = moduleIndex + 1;

    if (!module.subModules || !Array.isArray(module.subModules)) {
      module.subModules = [];
    }

    // Index submodules
    module.subModules.forEach((subModule, subModuleIndex) => {
      subModule.id = subModule.id || generateSubModuleId(
        course._id,
        moduleIndex + 1,
        subModuleIndex + 1
      );
      subModule.order = subModuleIndex + 1;
      totalSubModules++;

      indexed.push({
        moduleId: module.id,
        moduleOrder: module.order,
        moduleTitle: module.title,
        subModuleId: subModule.id,
        subModuleOrder: subModule.order,
        subModuleTitle: subModule.title
      });
    });
  });

  return {
    totalModules: course.modules.length,
    totalSubModules,
    indexed
  };
};

/**
 * Update user progress when course structure changes
 * Handles:
 * - Removed modules/submodules (mark as removed, preserve completion)
 * - Reordered modules/submodules (update references)
 * - New modules/submodules (add to tracking)
 */
const updateUserProgressForCourseChange = async (courseId, oldIndexing, newIndexing) => {
  const User = mongoose.model('User');
  
  // Find all users enrolled in this course
  const users = await User.find({
    'enrollments.course': courseId
  });

  if (users.length === 0) {
    return {
      usersUpdated: 0,
      progressUpdated: 0
    };
  }

  let usersUpdated = 0;
  let progressUpdated = 0;

  for (const user of users) {
    const enrollment = user.enrollments.find(
      e => e.course.toString() === courseId.toString()
    );

    if (!enrollment) continue;

    // Create map of old submodule IDs
    const oldSubModulesMap = new Map(
      oldIndexing.indexed.map(item => [item.subModuleId, item])
    );

    // Create map of new submodule IDs
    const newSubModulesMap = new Map(
      newIndexing.indexed.map(item => [item.subModuleId, item])
    );

    // Update module progress
    const updatedProgress = [];
    const preservedProgress = new Set();

    // Step 1: Preserve progress for modules that still exist
    enrollment.moduleProgress.forEach(progress => {
      if (newSubModulesMap.has(progress.subModuleId)) {
        // Module still exists, keep progress
        updatedProgress.push(progress);
        preservedProgress.add(progress.subModuleId);
      } else if (progress.completed) {
        // Module was removed but user completed it - mark as archived
        progress.archived = true;
        progress.archivedAt = new Date();
        updatedProgress.push(progress);
      }
      // Otherwise, drop incomplete progress for removed modules
    });

    // Step 2: Add tracking for new submodules
    newIndexing.indexed.forEach(item => {
      if (!preservedProgress.has(item.subModuleId)) {
        updatedProgress.push({
          moduleId: item.moduleId,
          subModuleId: item.subModuleId,
          completed: false,
          lastVisited: null
        });
      }
    });

    // Update enrollment
    enrollment.moduleProgress = updatedProgress;
    enrollment.totalModules = newIndexing.totalSubModules;
    
    // Recalculate progress
    const completedCount = updatedProgress.filter(p => p.completed && !p.archived).length;
    enrollment.completedModules = completedCount;
    enrollment.progress = newIndexing.totalSubModules > 0 
      ? Math.round((completedCount / newIndexing.totalSubModules) * 100)
      : 0;

    usersUpdated++;
    progressUpdated += updatedProgress.length;
  }

  // Save all users
  await Promise.all(users.map(user => user.save()));

  return {
    usersUpdated,
    progressUpdated,
    details: {
      totalSubModules: newIndexing.totalSubModules,
      oldSubModules: oldIndexing.totalSubModules
    }
  };
};

/**
 * Remove course from all user enrollments
 * Called when a course is deleted
 */
const removeCourseFromEnrollments = async (courseId) => {
  const User = mongoose.model('User');
  
  const result = await User.updateMany(
    { 'enrollments.course': courseId },
    { 
      $pull: { 
        enrollments: { course: courseId } 
      } 
    }
  );

  return {
    usersUpdated: result.modifiedCount,
    message: `Removed course from ${result.modifiedCount} user enrollments`
  };
};

/**
 * Initialize progress tracking for new enrollment
 */
const initializeEnrollmentProgress = async (userId, courseId) => {
  const User = mongoose.model('User');
  const Course = mongoose.model('Course');

  const course = await Course.findById(courseId);
  if (!course) {
    throw new Error('Course not found');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Check if already enrolled
  const existingEnrollment = user.enrollments.find(
    e => e.course.toString() === courseId.toString()
  );

  if (existingEnrollment) {
    return {
      alreadyEnrolled: true,
      enrollment: existingEnrollment
    };
  }

  // Index the course
  const indexing = indexCourseModules(course);

  // Create new enrollment
  const enrollment = {
    course: courseId,
    enrolledAt: new Date(),
    lastAccessed: new Date(),
    progress: 0,
    totalModules: indexing.totalSubModules,
    completedModules: 0,
    moduleProgress: indexing.indexed.map(item => ({
      moduleId: item.moduleId,
      subModuleId: item.subModuleId,
      completed: false,
      lastVisited: null
    }))
  };

  user.enrollments.push(enrollment);
  await user.save();

  return {
    alreadyEnrolled: false,
    enrollment: user.enrollments[user.enrollments.length - 1],
    totalModules: indexing.totalSubModules
  };
};

/**
 * Update progress for a specific submodule
 */
const updateSubModuleProgress = async (userId, courseId, moduleId, subModuleId) => {
  const User = mongoose.model('User');
  
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const enrollment = user.enrollments.find(
    e => e.course.toString() === courseId.toString()
  );

  if (!enrollment) {
    throw new Error('User not enrolled in this course');
  }

  // Find or create progress entry
  let progressEntry = enrollment.moduleProgress.find(
    p => p.moduleId === moduleId && p.subModuleId === subModuleId
  );

  if (!progressEntry) {
    // Create new entry if it doesn't exist
    progressEntry = {
      moduleId,
      subModuleId,
      completed: false,
      lastVisited: new Date()
    };
    enrollment.moduleProgress.push(progressEntry);
  }

  // Mark as completed if not already
  if (!progressEntry.completed) {
    progressEntry.completed = true;
    progressEntry.completedAt = new Date();
    
    // Update enrollment stats
    enrollment.completedModules = enrollment.moduleProgress.filter(p => p.completed && !p.archived).length;
    enrollment.progress = enrollment.totalModules > 0
      ? Math.round((enrollment.completedModules / enrollment.totalModules) * 100)
      : 0;
  }

  progressEntry.lastVisited = new Date();
  enrollment.lastAccessed = new Date();

  await user.save();

  return {
    progress: enrollment.progress,
    completedModules: enrollment.completedModules,
    totalModules: enrollment.totalModules,
    subModuleCompleted: progressEntry.completed
  };
};

/**
 * Get user's progress for a specific course
 */
const getUserCourseProgress = async (userId, courseId) => {
  const User = mongoose.model('User');
  
  const user = await User.findById(userId).populate('enrollments.course');
  if (!user) {
    throw new Error('User not found');
  }

  const enrollment = user.enrollments.find(
    e => e.course._id.toString() === courseId.toString()
  );

  if (!enrollment) {
    return {
      enrolled: false,
      progress: 0
    };
  }

  // Get active (non-archived) progress
  const activeProgress = enrollment.moduleProgress.filter(p => !p.archived);
  const completedProgress = activeProgress.filter(p => p.completed);

  return {
    enrolled: true,
    progress: enrollment.progress,
    completedModules: enrollment.completedModules,
    totalModules: enrollment.totalModules,
    enrolledAt: enrollment.enrolledAt,
    lastAccessed: enrollment.lastAccessed,
    moduleProgress: activeProgress.map(p => ({
      moduleId: p.moduleId,
      subModuleId: p.subModuleId,
      completed: p.completed,
      completedAt: p.completedAt,
      lastVisited: p.lastVisited
    })),
    recentActivity: activeProgress
      .filter(p => p.lastVisited)
      .sort((a, b) => b.lastVisited - a.lastVisited)
      .slice(0, 5)
  };
};

/**
 * Validate and repair course indexing
 * Ensures all modules and submodules have proper IDs and ordering
 */
const validateAndRepairCourseIndexing = async (courseId) => {
  const Course = mongoose.model('Course');
  
  const course = await Course.findById(courseId);
  if (!course) {
    throw new Error('Course not found');
  }

  const oldIndexing = indexCourseModules(course);
  
  // Re-index to ensure consistency
  const newIndexing = indexCourseModules(course);
  
  // Save updated course
  await course.save();

  // Update user progress
  const progressUpdate = await updateUserProgressForCourseChange(
    courseId,
    oldIndexing,
    newIndexing
  );

  return {
    courseId,
    courseTitle: course.title,
    indexing: newIndexing,
    progressUpdate
  };
};

module.exports = {
  indexCourseModules,
  updateUserProgressForCourseChange,
  removeCourseFromEnrollments,
  initializeEnrollmentProgress,
  updateSubModuleProgress,
  getUserCourseProgress,
  validateAndRepairCourseIndexing,
  generateModuleId,
  generateSubModuleId
};
