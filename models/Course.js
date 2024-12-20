const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    unique: true
  },
  
  description: {
    type: String,
    required: true
  },
  difficulty: {
    type: String,
    required: true,
    enum: ['Beginner', 'Intermediate', 'Advanced', 'Beginner to Advanced', 'Intermediate to Advanced', 'Comprehensive']
  },
  duration: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['programming', 'web', 'data']
  },
  path: {
    type: String,
    required: true,
    unique: true
  }
}, { 
  timestamps: true,
  collection: 'courses' // explicitly set collection name
});

// Debug middleware
courseSchema.pre('save', function(next) {
  console.log('Attempting to save course:', JSON.stringify(this.toObject(), null, 2));
  next();
});

module.exports = mongoose.model('Course', courseSchema);
