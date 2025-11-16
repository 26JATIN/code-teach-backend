const mongoose = require('mongoose');
const { 
  indexCourseModules, 
  updateUserProgressForCourseChange,
  removeCourseFromEnrollments 
} = require('../utils/courseIndexing');

const courseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  tags: [String],
  icon: {
    type: String,
    default: '📚'
  },
  color: {
    type: String,
    default: '#3B82F6' // Default blue color
  },
  // Auto-calculated fields (set by modules)
  totalModules: {
    type: Number,
    default: 0
  },
  totalSubModules: {
    type: Number,
    default: 0
  },
  totalEstimatedHours: {
    type: Number, // in hours (calculated from modules)
    default: 0
  },
  // Optional enrollment tracking
  enrollmentCount: {
    type: Number,
    default: 0
  },
  isPublished: {
    type: Boolean,
    default: true
  },
  publishedAt: {
    type: Date
  }
}, { 
  timestamps: true,
  collection: 'courses',
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
courseSchema.index({ isPublished: 1 });
courseSchema.index({ enrollmentCount: -1 });
courseSchema.index({ tags: 1 });

// Virtual for modules
courseSchema.virtual('modules', {
  ref: 'Module',
  localField: '_id',
  foreignField: 'courseId'
});

// Pre-save middleware for published date
courseSchema.pre('save', function(next) {
  if (this.isPublished && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  next();
});

// Method to update course statistics from modules
courseSchema.methods.updateStatisticsFromModules = async function() {
  const Module = mongoose.model('Module');
  const modules = await Module.find({ courseId: this._id });
  
  this.totalModules = modules.length;
  this.totalSubModules = modules.reduce((sum, module) => sum + (module.subModules?.length || 0), 0);
  
  // Calculate total hours from modules (estimated time in minutes converted to hours)
  const totalMinutes = modules.reduce((sum, module) => sum + (module.totalEstimatedTime || 0), 0);
  this.totalEstimatedHours = Math.round(totalMinutes / 60 * 10) / 10; // Round to 1 decimal
  
  return this.save();
};

// Pre-remove middleware to clean up enrollments
courseSchema.pre('remove', async function(next) {
  try {
    await removeCourseFromEnrollments(this._id);
    console.log(`Removed course ${this.title} from all user enrollments`);
    next();
  } catch (error) {
    console.error('Error removing course from enrollments:', error);
    next(error);
  }
});

// Also handle findOneAndDelete and findOneAndRemove
courseSchema.pre('findOneAndDelete', async function(next) {
  try {
    const doc = await this.model.findOne(this.getFilter());
    if (doc) {
      await removeCourseFromEnrollments(doc._id);
      console.log(`Removed course ${doc.title} from all user enrollments`);
    }
    next();
  } catch (error) {
    console.error('Error removing course from enrollments:', error);
    next(error);
  }
});

courseSchema.pre('findOneAndRemove', async function(next) {
  try {
    const doc = await this.model.findOne(this.getFilter());
    if (doc) {
      await removeCourseFromEnrollments(doc._id);
      console.log(`Removed course ${doc.title} from all user enrollments`);
    }
    next();
  } catch (error) {
    console.error('Error removing course from enrollments:', error);
    next(error);
  }
});

// Method to increment enrollment count
courseSchema.methods.incrementEnrollment = function() {
  this.enrollmentCount += 1;
  return this.save();
};

// Static method to find published courses
courseSchema.statics.findPublished = function() {
  return this.find({ isPublished: true }).sort({ createdAt: -1 });
};

module.exports = mongoose.model('Course', courseSchema);
