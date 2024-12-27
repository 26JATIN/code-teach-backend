const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Add progress tracking schema
const moduleProgressSchema = new mongoose.Schema({
  moduleId: {
    type: String,
    required: true
  },
  subModuleId: {
    type: String,
    required: true
  },
  completed: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date
  },
  lastVisited: {
    type: Date,
    default: Date.now
  }
});

const enrollmentSchema = new mongoose.Schema({
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
    validate: {
      validator: async function(v) {
        if (!v) return false;
        const courseExists = await mongoose.model('Course').exists({ _id: v });
        return courseExists;
      },
      message: 'Course does not exist'
    }
  },
  enrolledAt: {
    type: Date,
    default: Date.now
  },
  lastAccessed: {
    type: Date,
    default: Date.now
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  moduleProgress: [moduleProgressSchema],
  lastAccessed: {
    type: Date,
    default: Date.now
  },
  completedModules: {
    type: Number,
    default: 0
  },
  totalModules: {
    type: Number,
    default: 0
  }
});

// Add this pre-save middleware for enrollmentSchema
enrollmentSchema.pre('save', async function(next) {
  try {
    if (!this.course) {
      throw new Error('Course reference is required');
    }
    
    if (!mongoose.Types.ObjectId.isValid(this.course)) {
      throw new Error('Invalid course ID format');
    }

    const courseExists = await mongoose.model('Course').exists({ _id: this.course });
    if (!courseExists) {
      throw new Error('Referenced course does not exist');
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Add method to update module progress
enrollmentSchema.methods.updateModuleProgress = async function(moduleId, subModuleId) {
  const moduleProgress = this.moduleProgress.find(
    p => p.moduleId === moduleId && p.subModuleId === subModuleId
  );

  if (moduleProgress) {
    moduleProgress.completed = true;
    moduleProgress.completedAt = new Date();
    moduleProgress.lastVisited = new Date();
  } else {
    this.moduleProgress.push({
      moduleId,
      subModuleId,
      completed: true,
      completedAt: new Date()
    });
  }

  // Update completion stats
  this.completedModules = this.moduleProgress.filter(p => p.completed).length;
  this.progress = Math.round((this.completedModules / this.totalModules) * 100);
  this.lastAccessed = new Date();
};

// Add method to initialize module tracking
enrollmentSchema.methods.initializeModuleTracking = function(modules) {
  this.totalModules = modules.reduce((sum, module) => 
    sum + module.subModules.length, 0
  );
  
  // Initialize progress tracking for each module
  modules.forEach(module => {
    module.subModules.forEach(subModule => {
      if (!this.moduleProgress.find(p => 
        p.moduleId === module.id && p.subModuleId === subModule.id
      )) {
        this.moduleProgress.push({
          moduleId: module.id,
          subModuleId: subModule.id,
          completed: false
        });
      }
    });
  });
};

// Add method to update last accessed time
enrollmentSchema.methods.updateLastAccessed = function() {
  this.lastAccessed = new Date();
};

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    trim: true,
    minlength: [3, 'Username must be at least 3 characters long'],
    validate: {
      validator: function(v) {
        return /^[a-zA-Z0-9_-]+$/.test(v);
      },
      message: 'Username can only contain letters, numbers, underscores and hyphens'
    }
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^\w+([\.-]?\w+)*@\w+)*(\.\w{2,3})+$/.test(v);
      },
      message: props => `${props.value} is not a valid email!`
    }
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long']
  },
  enrolledCourses: [enrollmentSchema],
  resetPasswordToken: String,
  resetPasswordExpires: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Add better error handling to pre-save middleware
userSchema.pre('save', async function(next) {
  try {
    // Only hash the password if it's modified or new
    if (!this.isModified('password')) {
      return next();
    }
    
    // Validate password strength
    if (this.password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }
    
    // Generate salt and hash
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    
    // Log for debugging (remove in production)
    console.log('Password hashed successfully');
    
    next();
  } catch (error) {
    console.error('Error in password hashing:', error);
    next(error);
  }
});

// Add error handling to methods
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    // Log for debugging (remove in production)
    console.log('Comparing passwords...');
    
    const isMatch = await bcrypt.compare(candidatePassword, this.password);
    console.log('Password match:', isMatch);
    
    return isMatch;
  } catch (error) {
    console.error('Error comparing passwords:', error);
    throw new Error('Error comparing passwords');
  }
};

// Update the enrollInCourse method
userSchema.methods.enrollInCourse = async function(courseId) {
  try {
    // Validate courseId
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      throw new Error('Invalid course ID format');
    }

    // Check if course exists
    const course = await mongoose.model('Course').findById(courseId);
    if (!course) {
      throw new Error('Course not found');
    }

    // Check if already enrolled
    if (this.enrolledCourses.some(e => e.course?.toString() === courseId.toString())) {
      throw new Error('Already enrolled in this course');
    }
    
    this.enrolledCourses.push({ 
      course: courseId,
      enrolledAt: new Date(),
      progress: 0
    });
    
    await this.save();
    return this.enrolledCourses;
  } catch (error) {
    console.error('Error in enrollInCourse:', error);
    throw error;
  }
};

// Add method to get enrolled courses
userSchema.methods.getEnrolledCourses = function() {
  return this.enrolledCourses
    .filter(enrollment => enrollment.course) // Filter out null references
    .map(enrollment => ({
      _id: enrollment.course._id,
      courseId: enrollment.course._id, // Add this for compatibility
      progress: enrollment.progress,
      enrolledAt: enrollment.enrolledAt
    }));
};

// Update the cleanupEnrollments method
userSchema.methods.cleanupEnrollments = async function() {
  try {
    const Course = mongoose.model('Course');
    const validEnrollments = await Promise.all(
      this.enrolledCourses.map(async (enrollment) => {
        if (!enrollment.course) return null;
        
        const courseId = typeof enrollment.course === 'object' 
          ? enrollment.course._id 
          : enrollment.course;

        if (!mongoose.Types.ObjectId.isValid(courseId)) return null;

        const exists = await Course.exists({ _id: courseId });
        return exists ? enrollment : null;
      })
    );

    // Filter out null values and update enrollments
    const filteredEnrollments = validEnrollments.filter(e => e !== null);
    
    if (filteredEnrollments.length !== this.enrolledCourses.length) {
      this.enrolledCourses = filteredEnrollments;
      await this.save();
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error in cleanupEnrollments:', error);
    throw error;
  }
};

// Add a pre-find middleware to ensure populated courses exist
userSchema.pre('find', function() {
  this.populate({
    path: 'enrolledCourses.course',
    match: { _id: { $exists: true } }
  });
});

module.exports = mongoose.model('User', userSchema);
