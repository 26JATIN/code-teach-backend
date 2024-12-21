const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const enrollmentSchema = new mongoose.Schema({
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  enrolledAt: {
    type: Date,
    default: Date.now
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  lastAccessed: {
    type: Date,
    default: Date.now
  }
});

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
        return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(v);
      },
      message: props => `${props.value} is not a valid email!`
    }
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long']
  },
  enrolledCourses: [enrollmentSchema]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Add better error handling to pre-save middleware
userSchema.pre('save', async function(next) {
  try {
    if (!this.isModified('password')) return next();
    
    // Validate password strength
    if (this.password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }
    
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Add error handling to methods
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
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
    const validEnrollments = [];
    const Course = mongoose.model('Course');
    
    for (const enrollment of this.enrolledCourses) {
      if (!enrollment.course || !mongoose.Types.ObjectId.isValid(enrollment.course)) {
        continue;
      }
      
      const courseExists = await Course.exists({ _id: enrollment.course });
      if (courseExists) {
        validEnrollments.push(enrollment);
      }
    }
    
    if (validEnrollments.length !== this.enrolledCourses.length) {
      console.log(`Cleaning up enrollments for user ${this._id}`);
      console.log(`Before: ${this.enrolledCourses.length}, After: ${validEnrollments.length}`);
      this.enrolledCourses = validEnrollments;
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