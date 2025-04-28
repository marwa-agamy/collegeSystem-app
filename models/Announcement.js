const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  announcementId: {
    type: String,
    required: true,
    unique: true
  },
  sender: {
    type: String,
    ref: 'User',
    required: true
  },
  senderDetails: {
    name: String,
    profilePicture: String,
    role: String
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  courseCode: {
    type: String,
    ref: 'Course'
  },
  sectionId: {
    type: String,
    ref: 'Section'
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedBy: {
    type: String,
    ref: 'User'
  },
  deletedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Indexes
announcementSchema.index({ sender: 1 });
announcementSchema.index({ courseCode: 1 });
announcementSchema.index({ sectionId: 1 });
announcementSchema.index({ createdAt: -1 });
announcementSchema.index({ isDeleted: 1 });

module.exports = mongoose.model('Announcement', announcementSchema);