const mongoose = require('mongoose');

const ExamSchema = new mongoose.Schema({
  examId: {
    type: String,
    required: true,
    unique: true
  },
  courseCode: { 
    type: String, 
    required: true,
    ref: 'Course'
  },
  courseName: {
    type: String,
    required: true
  },
  examDate: {
    type: String,
    required: true
  },
  startTime: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s*(AM|PM)$/i
  },
  endTime: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s*(AM|PM)$/i
  },
  roomNumbers: {
    type: [String],
    required: true
  },
  rooms: [{
    roomNumber: String,
    students: [{
      studentId: String,
      name: String
    }]
  }],
  roomCapacity: {
    type: Number,
    required: true,
    default: 100
  },
  semester: {
    type: String,
    required: true
  },
  academicLevel: {
    type: String,
    enum: ['First', 'Second', 'Third', 'Fourth'],ref: 'User'
 },
  examType: {
    type: String,
    enum: ['Midterm', 'Final'],
    default: 'Final'
  },
  department: {
    type: String,
    required: true,
    enum: [
      "Administration",
      "Computing and Data Science",
      "Intelligent Systems",
      "Cybersecurity",
      "Business Analytics",
      "Media Analytics",
      "Healthcare Informatics and Data Analytics" 
    ],ref: 'User'
  }
}, { timestamps: true });
ExamSchema.index({ 
    courseCode: 1,
    semester: 1, 
    academicYear: 1,
    examType: 1
  }, { unique: false });  // Change to non-unique

module.exports = mongoose.model('Exam', ExamSchema);