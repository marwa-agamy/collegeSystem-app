const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true},
  id: { type: String, required: true, unique: true },
  password: { type: String, required: true, minlength: 8 },
  phoneNumber: { type: String, required: true, trim: true},
  role: { type: String, enum: ['admin', 'doctor', 'student', 'ta'], required: true },
  dateOfBirth: { type: String },
  gender: { type: String, enum: ['Male', 'Female'] },
  address: { type: String, trim: true },
  lastLogin: { type: Date },
  isActive: { type: Boolean, default: true },
  otp: { type: String },
  otpExpire: { type: Date }, 
  profilePicture: { type: String, default: '' },

  // Fields specific to students
  department: {
    type: String,
    trim: true,
    enum: [
      "Administration",
      "Computing and Data Science",
      "Intelligent Systems",
      "Cybersecurity",
      "Business Analytics",
      "Media Analytics",
      "Healthcare Informatics and Data Analytics"
    ],
    required: function () {
      return this.role === 'student';
    },
  },
  academicLevel: {
    type: String,
    enum: ['First', 'Second', 'Third', 'Fourth'],
    required: function () {
      return this.role === 'student';
    },
  },
  status: {
    type: String,
    enum: ['Active', 'Suspended', 'Graduated'],
    default: 'Active',
    required: function () {
      return this.role === 'student';
    },
  },
  academicAdvisor: {
    type: String,
    ref: 'User',
    required: function () {
      return this.role === 'student';
    },
  },
 
  fees: [
    {
      feeId: { type: String, required: true, ref: 'Fee' }, 
      amount: { type: Number, required: true }, 
      dueDate: { type: Date, required: true }, 
      status: { type: String, enum: ['Pending', 'Paid'] }, 
      createdAt: { type: Date, default: Date.now }, 
      paidAt: { type: Date },
    },
  ],
  registeredCourses: [{
    type: String,
    ref: 'Course',
    required: function () {
      return this.role === 'student';
    },
  }],
  
  registeredSections: [
    {
      type: String, required: true,
      ref: 'Section',
      required: function () {
        return this.role === 'student';
      },
    },
  ],
  assignedCourses: [
    {
      type: String, required: true,
      ref: 'Course',
      required: function () {
        return this.role === 'doctor';
      },
    },
  ],
  assignedSections: [
    {
      type: String, required: true,
      ref: 'Section',
      required: function () {
        return this.role === 'ta';
      },
    },
  ],
  
  timetable: [
    {
      courseId: { type: String, ref: 'Course', required: true },
      session: { type: String, required: true },
    },
  ],
  performance: {
    cgpa: { type: Number, default: 0 },
    termGpa: { type: Number, default: 0 },
    passedCourses: [{
      code: { type: String, required: true, ref: 'Course' },
      name: { type: String, required: true },
      creditHours: { type: Number, required: true },
      score: { type: Number, required: true },
      grade: { type: String, required: true },
      term: { type: String, required: true },
      _id: false
    }],
    failedCourses: [{
      code: { type: String, required: true, ref: 'Course' },
      name: { type: String, required: true },
      creditHours: { type: Number, required: true },
      score: { type: Number, required: true },
      grade: { type: String, required: true },
      term: { type: String, required: true },
      _id: false
    }],
    totalCreditHoursCompleted: { type: Number, default: 0 },
    remainingCreditHours: { type: Number, default: 140 },
    academicLevel: { type: String, default: 'First' },
    maxAllowedCreditHours: { type: Number, default: 18 },
    termStatus: { type: String, enum: ['active', 'completed'], default: 'active' }
  },
  currentTermCourses: [{
    code: { type: String, required: true, ref: 'Course' },
    name: { type: String, required: true },
    creditHours: { type: Number, required: true },
    _id: false
  }], exams: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam'
  }],
  academicHistory: [{
    term: { type: String, required: true },
    courses: [{
      code: { type: String, required: true, ref: 'Course' },
      name: { type: String, required: true },
      creditHours: { type: Number, required: true },
      grade: { type: String, required: true },
      score: { type: Number, required: true },
      status: { type: String, enum: ['passed', 'failed'] },
      _id: false
    }],
    termGPA: { type: Number, required: true },
    totalCredits: { type: Number, required: true },
    status: { type: String, enum: ['active', 'completed'], default: 'completed' },
    _id: false
  }],

conversations: {
  type: [{
    withUser: { 
      type: String,
      ref: 'User',
      required: true 
    },
    unreadCount: { 
      type: Number, 
      default: 0 
    },
    lastMessage: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Message' 
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
}}, { timestamps: true });


// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next(); 
  const salt = await bcrypt.genSalt(10); 
  this.password = await bcrypt.hash(this.password, salt); 
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);