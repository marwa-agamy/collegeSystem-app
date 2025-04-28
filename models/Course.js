const mongoose = require('mongoose');

// Schema for a single session (lecture or section)
const SessionSchema = new mongoose.Schema({
  day: { 
    type: String, 
    required: true, 
    enum: ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] 
  },
  startTime: { type: String, required: true }, 
  endTime: { type: String, required: true }, 
  room: { type: String, required: true, trim: true },
  type: { type: String, enum: ['Lecture', 'Section'] }
});

// Schema for a course section
const SectionSchema = new mongoose.Schema({
  sectionId: { 
    type: String, 
    required: function() {
      // Only require sectionId if the section exists
      return this.parent().sections && this.parent().sections.length > 0;
    },
    unique: false // Removed unique constraint here
  },
  taId: { type: String, ref: 'User' }, 
  capacity: { 
    type: Number, 
    required: function() {
      return this.parent().sections && this.parent().sections.length > 0;
    },
    min: 1 
  }, 
  registeredStudents: [{ type: String, ref: 'User' }], 
  sessions: [SessionSchema],
  isFull: { type: Boolean, default: false } 
});

// Schema for a course
const CourseSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, unique: true }, 
  doctorId: { type: String, required: true, ref: 'User' }, 
  creditHours: { type: Number, required: true, min: 1 },
  prerequisites: [{ type: String, uppercase: true }],
  registeredStudents: [{ type: String, ref: 'User' }], 
  passedCourses: [{ type: String }],
  sections: {
    type: [SectionSchema],
    default: [] // Default to empty array
  },
  lectureSessions: { 
    type: [SessionSchema],
    default: [] // Default to empty array
  },
  semester: { type: String, required: true, enum: ['Fall', 'Spring', 'Summer'] },
  startDate: { type: Date, required: true },
  endDate: { 
    type: Date, 
    required: true, 
    validate: [dateValidator, 'End date must be after start date'] 
  },
  department: {
    type: String,
    required: true,
    trim: true,
    enum: [
      "Administration",
      "Computing and Data Science",
      "Intelligent Systems",
      "Cybersecurity",
      "Business Analytics",
      "Media Analytics",
      "Healthcare Informatics and Data Analytics"
    ]
  },
  capacity: { type: Number, required: true, min: 1 },
  isActive: { type: Boolean, default: true }
});

// Custom validator for endDate
function dateValidator(value) {
  return this.startDate < value;
}

// Compound index to ensure sectionId is unique within a course
CourseSchema.index({ 'code': 1, 'sections.sectionId': 1 }, { unique: true });

// Middleware to check if a section is full before saving
SectionSchema.pre('save', function (next) {
  if (this.registeredStudents && this.registeredStudents.length >= this.capacity) {
    this.isFull = true;
  } else {
    this.isFull = false;
  }
  next();
});

module.exports = mongoose.model('Course', CourseSchema);