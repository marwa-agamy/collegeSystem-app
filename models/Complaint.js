const mongoose = require('mongoose');

const ComplaintSchema = new mongoose.Schema({
  complaintId: { type: String, required: true, unique: true },
  userId: { type: String, required: true, ref: 'User' }, 
  role: { type: String, required: true, enum: ['student', 'doctor', 'ta'] }, 
  complaint: { type: String, required: true, trim: true }, 
  status: { type: String, enum: ['Pending', 'Resolved'], default: 'Pending' },
  createdAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date },
  adminResponse: { type: String, trim: true }
});

module.exports = mongoose.model('Complaint', ComplaintSchema);