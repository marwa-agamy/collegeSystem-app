const mongoose = require('mongoose');

const GradeSchema = new mongoose.Schema({
  studentId: { type: String, required: true , ref: 'User'},
  courseCode: { type: String, required: true, ref: 'Course' },
  courseName: { type: String, required: true , ref: 'Course' },
  doctorId: { type: String, required: true , ref: 'User' },
  score: { type: Number, required: true, min: 0, max: 100 }, // Numeric score out of 100
  grade: { type: String, enum: ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F'] }, // Letter grade
  term: { type: String, required: true },
  creditHours: { type: Number, required: true , ref: 'Course'},
  isRetake: { type: Boolean, default: false },
  attemptNumber: { type: Number, default: 1 },
  dateGraded: { type: Date, default: Date.now }
}, 
{ timestamps: true });

// Prevent duplicate grades for same student/course/term
GradeSchema.index(
  { studentId: 1, courseCode: 1, term: 1 }, 
  { unique: true }
);

module.exports = mongoose.model('Grade', GradeSchema);