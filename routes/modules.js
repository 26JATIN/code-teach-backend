const express = require('express');
const router = express.Router();
const Module = require('../models/Module');
const Course = require('../models/Course');
const authenticateToken = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// Get all modules for a course (ADMIN - Full details with _id and contentBlocks)
router.get('/course/:courseId/admin', adminAuth, async (req, res) => {
  try {
    const { courseId } = req.params;
    
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Fetch ALL modules (including unpublished) with full details
    const modules = await Module.find({ courseId }).sort({ order: 1 });
    
    // Return complete module structure with _id and all fields
    const fullModules = modules.map(module => ({
      _id: module._id, // Include MongoDB _id for updates/deletes
      courseId: module.courseId,
      id: module.id,
      title: module.title,
      description: module.description,
      order: module.order,
      icon: module.icon,
      totalEstimatedTime: module.totalEstimatedTime,
      isPublished: module.isPublished,
      subModules: module.subModules.map(sm => ({
        _id: sm._id, // Include submodule _id
        id: sm.id,
        title: sm.title,
        description: sm.description,
        order: sm.order,
        estimatedTime: sm.estimatedTime,
        difficulty: sm.difficulty,
        isPublished: sm.isPublished,
        prerequisites: sm.prerequisites,
        contentBlocks: sm.contentBlocks || [] // Include full content blocks
      }))
    }));

    res.json({
      course: {
        id: course._id,
        title: course.title,
        shortName: course.shortName
      },
      modules: fullModules
    });
  } catch (error) {
    console.error('Error fetching modules for admin:', error);
    res.status(500).json({ error: 'Error fetching modules' });
  }
});

// Get all modules for a course (PUBLIC - Simplified for navigation)
router.get('/course/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params;
    
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const modules = await Module.findByCourse(courseId);
    
    // Return simplified module structure for navigation
    const simplifiedModules = modules.map(module => ({
      id: module.id,
      title: module.title,
      description: module.description,
      order: module.order,
      icon: module.icon,
      totalEstimatedTime: module.totalEstimatedTime,
      subModules: module.subModules.map(sm => ({
        id: sm.id,
        title: sm.title,
        description: sm.description,
        order: sm.order,
        estimatedTime: sm.estimatedTime,
        difficulty: sm.difficulty
      }))
    }));

    res.json({
      course: {
        id: course._id,
        title: course.title,
        shortName: course.shortName
      },
      modules: simplifiedModules
    });
  } catch (error) {
    console.error('Error fetching modules:', error);
    res.status(500).json({ error: 'Error fetching modules' });
  }
});

// Get specific submodule content
router.get('/course/:courseId/module/:moduleId/submodule/:subModuleId', async (req, res) => {
  try {
    const { courseId, moduleId, subModuleId } = req.params;
    
    const module = await Module.findOne({
      courseId,
      id: moduleId
    });

    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }

    const subModule = module.subModules.find(sm => sm.id === subModuleId);
    
    if (!subModule) {
      return res.status(404).json({ error: 'Submodule not found' });
    }

    if (!subModule.isPublished) {
      return res.status(403).json({ error: 'Submodule not published' });
    }

    // Find next and previous submodules
    const nextSubModule = module.getNextSubModule(subModuleId);
    const previousSubModule = module.getPreviousSubModule(subModuleId);

    res.json({
      module: {
        id: module.id,
        title: module.title
      },
      subModule: subModule,
      navigation: {
        next: nextSubModule ? {
          moduleId: module.id,
          id: nextSubModule.id,
          title: nextSubModule.title
        } : null,
        previous: previousSubModule ? {
          moduleId: module.id,
          id: previousSubModule.id,
          title: previousSubModule.title
        } : null
      }
    });
  } catch (error) {
    console.error('Error fetching submodule:', error);
    res.status(500).json({ error: 'Error fetching submodule content' });
  }
});

// Create a new module (Admin only - add admin auth middleware later)
router.post('/course/:courseId/module', async (req, res) => {
  try {
    const { courseId } = req.params;
    const moduleData = req.body;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const module = new Module({
      courseId,
      ...moduleData
    });

    await module.save();

    // Update course statistics
    course.totalModules += 1;
    course.totalLessons += module.subModules.length;
    course.totalEstimatedTime += module.totalEstimatedTime;
    await course.save();

    res.status(201).json({
      message: 'Module created successfully',
      module
    });
  } catch (error) {
    console.error('Error creating module:', error);
    res.status(500).json({ error: 'Error creating module' });
  }
});

// Update a module (Admin only)
router.put('/course/:courseId/module/:moduleId', async (req, res) => {
  try {
    const { courseId, moduleId } = req.params;
    const updates = req.body;

    const module = await Module.findOneAndUpdate(
      { courseId, id: moduleId },
      updates,
      { new: true, runValidators: true }
    );

    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }

    res.json({
      message: 'Module updated successfully',
      module
    });
  } catch (error) {
    console.error('Error updating module:', error);
    res.status(500).json({ error: 'Error updating module' });
  }
});

// Delete a module (Admin only)
router.delete('/course/:courseId/module/:moduleId', async (req, res) => {
  try {
    const { courseId, moduleId } = req.params;

    const module = await Module.findOneAndDelete({ courseId, id: moduleId });

    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }

    // Update course statistics
    const course = await Course.findById(courseId);
    if (course) {
      course.totalModules = Math.max(0, course.totalModules - 1);
      course.totalLessons = Math.max(0, course.totalLessons - module.subModules.length);
      course.totalEstimatedTime = Math.max(0, course.totalEstimatedTime - module.totalEstimatedTime);
      await course.save();
    }

    res.json({ message: 'Module deleted successfully' });
  } catch (error) {
    console.error('Error deleting module:', error);
    res.status(500).json({ error: 'Error deleting module' });
  }
});

// Add a submodule to a module (Admin only)
router.post('/course/:courseId/module/:moduleId/submodule', async (req, res) => {
  try {
    const { courseId, moduleId } = req.params;
    const subModuleData = req.body;

    const module = await Module.findOne({ courseId, id: moduleId });

    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }

    module.subModules.push(subModuleData);
    await module.save();

    res.status(201).json({
      message: 'Submodule added successfully',
      subModule: module.subModules[module.subModules.length - 1]
    });
  } catch (error) {
    console.error('Error adding submodule:', error);
    res.status(500).json({ error: 'Error adding submodule' });
  }
});

// Update a submodule (Admin only)
router.put('/course/:courseId/module/:moduleId/submodule/:subModuleId', async (req, res) => {
  try {
    const { courseId, moduleId, subModuleId } = req.params;
    const updates = req.body;

    const module = await Module.findOne({ courseId, id: moduleId });

    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }

    const subModuleIndex = module.subModules.findIndex(sm => sm.id === subModuleId);

    if (subModuleIndex === -1) {
      return res.status(404).json({ error: 'Submodule not found' });
    }

    // Update submodule fields
    Object.keys(updates).forEach(key => {
      module.subModules[subModuleIndex][key] = updates[key];
    });

    await module.save();

    res.json({
      message: 'Submodule updated successfully',
      subModule: module.subModules[subModuleIndex]
    });
  } catch (error) {
    console.error('Error updating submodule:', error);
    res.status(500).json({ error: 'Error updating submodule' });
  }
});

// Get module structure (for development/admin)
router.get('/structure', async (req, res) => {
  try {
    const modules = await Module.find({}).select('courseId id title order subModules.id subModules.title');
    res.json(modules);
  } catch (error) {
    console.error('Error fetching module structure:', error);
    res.status(500).json({ error: 'Error fetching module structure' });
  }
});

// Create a new module (simpler route for frontend)
router.post('/', async (req, res) => {
  try {
    const moduleData = req.body;
    const { courseId } = moduleData;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const module = new Module(moduleData);
    await module.save();

    // Update course statistics
    await course.updateStatisticsFromModules();

    res.status(201).json({
      message: 'Module created successfully',
      module
    });
  } catch (error) {
    console.error('Error creating module:', error);
    res.status(500).json({ error: 'Error creating module', details: error.message });
  }
});

// Update a module by _id (simpler route for frontend)
router.put('/:moduleId', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const updates = req.body;

    const module = await Module.findByIdAndUpdate(
      moduleId,
      updates,
      { new: true, runValidators: true }
    );

    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }

    // Update course statistics
    const course = await Course.findById(module.courseId);
    if (course) {
      await course.updateStatisticsFromModules();
    }

    res.json({
      message: 'Module updated successfully',
      module
    });
  } catch (error) {
    console.error('Error updating module:', error);
    res.status(500).json({ error: 'Error updating module', details: error.message });
  }
});

// Delete a module by _id
router.delete('/:moduleId', async (req, res) => {
  try {
    const { moduleId } = req.params;

    const module = await Module.findByIdAndDelete(moduleId);

    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }

    // Update course statistics
    const course = await Course.findById(module.courseId);
    if (course) {
      await course.updateStatisticsFromModules();
    }

    res.json({ message: 'Module deleted successfully' });
  } catch (error) {
    console.error('Error deleting module:', error);
    res.status(500).json({ error: 'Error deleting module' });
  }
});

module.exports = router;
