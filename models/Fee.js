const mongoose = require('mongoose');

const FeeSchema = new mongoose.Schema({
  feeId: { type: String, required: true, unique: true },
  academicLevel: {
    type: String,
    enum: ['First', 'Second', 'Third', 'Fourth']}, 
  department: { type: String, required: true },
  amount: { type: Number, required: true },
  dueDate: { type: Date, required: true }, 
  createdAt: { type: Date, default: Date.now },
  students: [
    {
      studentId: { type: String, required: true, ref: 'User' },
      status: { type: String, enum: ['Pending', 'Paid'] },
      paidAt: { type: Date },
    },
  ],
});

module.exports = mongoose.model('Fee', FeeSchema);