const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  messageId: {
    type: String,
    required: true,
    unique: true
  },
  sender: {
    type: String,
    ref: 'User',
    required: true
  },
  senderRole: {
    type: String,
    enum: ['admin', 'doctor', 'ta', 'student'],
    required: true
  },
  receiver: {
    type: String,
    ref: 'User',
    required: true
  },
  receiverRole: {
    type: String,
    enum: ['admin', 'doctor', 'ta', 'student'],
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  deletedBy: [{
    userId: {
      type: String,
      ref: 'User'
    },
    deletedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for faster querying
messageSchema.index({ sender: 1, receiver: 1 });
messageSchema.index({ receiver: 1, status: 1 });
messageSchema.index({ createdAt: -1 });

// Virtual populate for sender details
messageSchema.virtual('senderDetails', {
  ref: 'User',
  localField: 'sender',
  foreignField: 'id',
  justOne: true,
  options: { select: 'id name role profilePicture' }
});

// Virtual populate for receiver details
messageSchema.virtual('receiverDetails', {
  ref: 'User',
  localField: 'receiver',
  foreignField: 'id',
  justOne: true,
  options: { select: 'id name role profilePicture' }
});

module.exports = mongoose.model('Message', messageSchema);