const mongoose = require('mongoose');

// Schema for Code Snippets
const codeSnippetSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  code: {
    type: String,
    required: true
  },
  language: {
    type: String,
    default: 'java',
    enum: ['java', 'javascript', 'python', 'cpp', 'html', 'css']
  },
  showLineNumbers: {
    type: Boolean,
    default: true
  },
  showCopyButton: {
    type: Boolean,
    default: true
  },
  highlightLines: [Number]
});

// Schema for Key Features/Points
const keyFeatureSchema = new mongoose.Schema({
  icon: String,
  text: {
    type: String,
    required: true
  }
});

// Schema for MCQ Questions
const mcqOptionSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true
  },
  isCorrect: {
    type: Boolean,
    default: false
  }
});

const mcqQuestionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true
  },
  options: [mcqOptionSchema],
  explanation: String,
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  }
});

// Schema for Coding Exercises
const codingExerciseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: String,
  hints: [String],
  starterCode: String,
  solution: String,
  testCases: [{
    input: String,
    expectedOutput: String
  }],
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  }
});

// Schema for Content Sections (like ConceptExplanation sections)
const contentSectionSchema = new mongoose.Schema({
  icon: String,
  title: {
    type: String,
    required: true
  },
  content: [String],
  code: String,
  codeLanguage: {
    type: String,
    default: 'java'
  }
});

// Schema for Important Notes
const importantNoteSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  points: [String],
  variant: {
    type: String,
    enum: ['yellow', 'red', 'blue', 'green', 'purple'],
    default: 'yellow'
  }
});

// Schema for Mistakes to Avoid
const mistakeSchema = new mongoose.Schema({
  title: String,
  mistakes: [String],
  alternatives: [String]
});

// Schema for Timeline Events
const timelineEventSchema = new mongoose.Schema({
  year: String,
  title: {
    type: String,
    required: true
  },
  description: String
});

// Schema for Hands-On Practice
const handsOnSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: String,
  defaultCode: String,
  solution: String
});

// Main Content Block Schema (flexible content structure)
const contentBlockSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: [
      'summary',           // Text summary with title
      'keyFeatures',       // List of key features/points
      'codeSnippet',       // Code with syntax highlighting
      'conceptExplanation', // Detailed explanation
      'importantNote',     // Highlighted note (info/warning/success/error)
      'mistakesToAvoid',   // Common mistakes section
      'timeline',          // Timeline of events
      'handsOn',          // Hands-on practice
      'mcq',              // Multiple choice question
      'codingExercise',   // Coding challenge
      'text',             // Plain text/markdown
      'heading',          // Section heading
      'list',             // Ordered or unordered list
      'image',            // Image with caption
      'video',            // Video embed
      'link',             // External link
      'example',          // Code example with explanation
      'quiz',             // Interactive quiz
      'comparison'        // Comparison table
    ]
  },
  order: {
    type: Number,
    required: true
  },
  
  // Summary type
  summaryTitle: String,
  summaryDescription: String,
  
  // Key Features type
  featuresTitle: String,
  features: [keyFeatureSchema],
  featuresVariant: {
    type: String,
    enum: ['blue', 'green', 'purple', 'yellow', 'red'],
    default: 'blue'
  },
  
  // Code Snippet type
  codeSnippet: codeSnippetSchema,
  
  // Concept Explanation type
  conceptSections: [contentSectionSchema],
  
  // Important Note type
  importantNote: importantNoteSchema,
  
  // Mistakes to Avoid type
  mistakesToAvoid: mistakeSchema,
  
  // Timeline type
  timelineTitle: String,
  timelineEvents: [timelineEventSchema],
  
  // Hands-On type
  handsOn: handsOnSchema,
  
  // MCQ type
  mcqQuestions: [mcqQuestionSchema],
  
  // Coding Exercise type
  codingExercise: codingExerciseSchema,
  
  // Text type
  text: String,
  
  // Heading type
  heading: String,
  headingLevel: {
    type: Number,
    min: 1,
    max: 6,
    default: 2
  },
  
  // List type
  listItems: [String],
  listType: {
    type: String,
    enum: ['bullet', 'numbered'],
    default: 'bullet'
  },
  
  // Generic content field for flexible content types (image, video, link, example, quiz, comparison)
  content: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
});

// Sub-Module Schema
const subModuleSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  order: {
    type: Number,
    required: true
  },
  contentBlocks: [contentBlockSchema],
  estimatedTime: {
    type: Number, // in minutes
    default: 15
  },
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner'
  },
  prerequisites: [String], // Array of submodule IDs
  isPublished: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Main Module Schema
const moduleSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
    index: true
  },
  id: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  order: {
    type: Number,
    required: true
  },
  icon: String,
  subModules: [subModuleSchema],
  isPublished: {
    type: Boolean,
    default: true
  },
  totalEstimatedTime: {
    type: Number, // in minutes
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for better query performance
moduleSchema.index({ courseId: 1, order: 1 });
moduleSchema.index({ courseId: 1, id: 1 });

// Pre-save middleware to calculate total estimated time
moduleSchema.pre('save', function(next) {
  if (this.subModules && this.subModules.length > 0) {
    this.totalEstimatedTime = this.subModules.reduce(
      (total, subModule) => total + (subModule.estimatedTime || 0), 
      0
    );
  }
  next();
});

// Virtual for getting published submodules only
moduleSchema.virtual('publishedSubModules').get(function() {
  return this.subModules.filter(sm => sm.isPublished);
});

// Method to get next submodule
moduleSchema.methods.getNextSubModule = function(currentSubModuleId) {
  const currentIndex = this.subModules.findIndex(sm => sm.id === currentSubModuleId);
  if (currentIndex < this.subModules.length - 1) {
    return this.subModules[currentIndex + 1];
  }
  return null;
};

// Method to get previous submodule
moduleSchema.methods.getPreviousSubModule = function(currentSubModuleId) {
  const currentIndex = this.subModules.findIndex(sm => sm.id === currentSubModuleId);
  if (currentIndex > 0) {
    return this.subModules[currentIndex - 1];
  }
  return null;
};

// Static method to get all modules for a course
moduleSchema.statics.findByCourse = function(courseId) {
  return this.find({ courseId, isPublished: true })
    .sort({ order: 1 })
    .lean();
};

// Static method to get module with specific submodule
moduleSchema.statics.findSubModule = function(courseId, moduleId, subModuleId) {
  return this.findOne(
    { 
      courseId, 
      id: moduleId,
      'subModules.id': subModuleId 
    },
    {
      'subModules.$': 1,
      title: 1,
      id: 1
    }
  );
};

module.exports = mongoose.model('Module', moduleSchema);
