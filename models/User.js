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

// Add method to enroll in course
userSchema.methods.enrollInCourse = async function(courseId) {
  if (this.enrolledCourses.some(e => e.course.toString() === courseId.toString())) {
    throw new Error('Already enrolled in this course');
  }
  
  this.enrolledCourses.push({ course: courseId });
  await this.save();
  return this.enrolledCourses;
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

// Add this method to the schema
userSchema.methods.cleanupEnrollments = async function() {
  const validEnrollments = [];
  
  for (const enrollment of this.enrolledCourses) {
    const courseExists = await mongoose.model('Course').exists({ _id: enrollment.course });
    if (courseExists) {
      validEnrollments.push(enrollment);
    }
  }
  
  if (validEnrollments.length !== this.enrolledCourses.length) {
    this.enrolledCourses = validEnrollments;
    await this.save();
    return true;
  }
  return false;
};

// Add a pre-find middleware to ensure populated courses exist
userSchema.pre('find', function() {
  this.populate({
    path: 'enrolledCourses.course',
    match: { _id: { $exists: true } }
  });
});

module.exports = mongoose.model('User', userSchema);