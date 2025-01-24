const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Title must be at least 3 characters long'],
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    minlength: [10, 'Description must be at least 10 characters long'],
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  difficulty: {
    type: String,
    required: [true, 'Difficulty level is required'],
    enum: {
      values: ['Beginner', 'Intermediate', 'Advanced', 'Beginner to Advanced'],
      message: '{VALUE} is not a valid difficulty level'
    }
  },
  duration: {
    type: String,
    required: [true, 'Duration is required'],
    trim: true
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: {
      values: ['programming', 'web', 'data'],
      message: '{VALUE} is not a valid category'
    },
    lowercase: true
  },
  path: {
    type: String,
    required: [true, 'Path is required'],
    unique: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^\/courses\/[a-z0-9-]+$/.test(v);
      },
      message: props => `${props.value} is not a valid course path! Path should start with /courses/ and contain only lowercase letters, numbers, and hyphens`
    }
  },
  modules: [{
    title: {
      type: String,
      required: [true, 'Module title is required'],
      trim: true
    },
    description: {
      type: String,
      required: [true, 'Module description is required'],
      trim: true
    },
    subModules: [{
      title: {
        type: String,
        required: [true, 'Submodule title is required'],
        trim: true
      },
      description: {
        type: String,
        required: [true, 'Submodule description is required'],
        trim: true
      },
      summary: {
        title: String,
        description: String
      },
      keyFeatures: [{
        icon: String,
        text: String
      }],
      conceptSections: [{
        icon: String,
        title: String,
        content: [String],
        code: String
      }],
      codeExamples: [{
        title: String,
        code: String,
        showLineNumbers: {
          type: Boolean,
          default: true
        },
        showCopyButton: {
          type: Boolean,
          default: true
        }
      }],
      mistakesToAvoid: {
        mistakes: [String],
        alternatives: [String]
      },
      practiceExercises: [{
        title: String,
        description: String,
        hint: String
      }],
      mcqQuestions: [{
        question: String,
        options: [String],
        correctAnswer: Number,
        explanation: String
      }]
    }]
  }]
}, { 
  timestamps: true,
  collection: 'courses'
});

// Add indexing for better query performance
courseSchema.index({ category: 1 });
courseSchema.index({ path: 1 }, { unique: true });

// Add pre-save middleware for path formatting
courseSchema.pre('save', function(next) {
  // Ensure path starts with /courses/
  if (!this.path.startsWith('/courses/')) {
    this.path = '/courses/' + this.path.replace(/^\/+/, '');
  }
  
  // Convert path to lowercase and replace spaces with hyphens
  this.path = this.path.toLowerCase().replace(/\s+/g, '-');
  
  next();
});

// Add instance method to get course URL
courseSchema.methods.getUrl = function() {
  return this.path;
};

// Add static method to find by category
courseSchema.statics.findByCategory = function(category) {
  return this.find({ category: category.toLowerCase() });
};

module.exports = mongoose.model('Course', courseSchema);
