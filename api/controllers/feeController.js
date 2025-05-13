const Fee = require('../../models/Fee');
const User = require('../../models/User');

// Add a new fee (admin only)
const addFee = async (req, res) => {
    const { feeId, academicLevel, amount, dueDate, department } = req.body;
  
    try {
      // Find all students in the specified year of study and department
      const students = await User.find({ role: 'student', academicLevel, department });
  
      if (students.length === 0) {
        return res.status(404).json({ message: 'No students found for the specified year of study and department' });
      }
  
      // Check if a fee already exists for this year and department
      const existingFee = await Fee.findOne({ academicLevel, department });
      if (existingFee) {
        return res.status(400).json({ message: 'A fee already exists for this year and department' });
      }
  
      // Create a new fee
      const newFee = new Fee({
        feeId,
        academicLevel,
        department,
        amount,
        dueDate,
        students: students.map((student) => ({
          studentId: student.id,
          status: 'Pending', // Initialize status as Pending
        })),
      });
  
      await newFee.save();
  
      // Add the fee to each student's profile
      await Promise.all(
        students.map(async (student) => {
          student.fees.push({
            feeId: newFee.feeId, // Use the feeId from the Fee model
            amount: newFee.amount,
            dueDate: newFee.dueDate,
            status: 'Pending', // Initialize status as Pending
            createdAt: newFee.createdAt,
          });
  
          await student.save(); // Save the updated student document
        })
      );
  
      res.status(201).json({ message: 'Fee added successfully', fee: newFee });
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  };


// Update a fee (admin only)
const updateFeeStatus = async (req, res) => {
    const { feeId, studentId } = req.params; // Ensure these are correctly coming from params
    const { status } = req.body;

    try {
        const fee = await Fee.findOne({ feeId });
        if (!fee) {
            return res.status(404).json({ message: 'Fee not found.' });
        }

        const studentFee = fee.students.find(student => student.studentId === studentId);
        if (!studentFee) {
            return res.status(404).json({ message: 'Student not found in this fee.' });
        }

        studentFee.status = status;
        if (status === 'Paid') {
            studentFee.paidAt = Date.now();
        }

        await fee.save();
        res.status(200).json({ message: 'Fee status updated successfully', fee });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

  const deleteFee = async (req, res) => {
    const { feeId } = req.params;
  
    try {
      // Find the fee by feeId
      const fee = await Fee.findOne({ feeId });
      if (!fee) {
        return res.status(404).json({ message: 'Fee not found' });
      }
  
      // Get the list of student IDs associated with this fee
      const studentIds = fee.students.map((student) => student.studentId);
  
      // Delete the fee from the Fee collection
      await Fee.deleteOne({ feeId });
  
      // Remove the fee from each student's profile
      await User.updateMany(
        { id: { $in: studentIds } }, // Find all students associated with this fee
        { $pull: { fees: { feeId } } // Remove the fee from their fees array
    });
  
      res.status(200).json({ message: 'Fee deleted successfully', fee });
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  };

// Get all fees for a student (student and admin)
const getFeesByStudent = async (req, res) => {
    const { studentId } = req.params;
  
    try {
      // Ensure the student is accessing their own fees
      if (req.user.role === 'student' && req.user.id !== studentId) {
        return res.status(403).json({ message: 'You are not authorized to access this student\'s fees' });
      }
  
      // Find the student by studentId
      const student = await User.findOne({ id: studentId }).select('fees'); // Only fetch the fees array
      if (!student) {
        return res.status(404).json({ message: 'Student not found' });
      }
  
      // Return the fees array from the student's profile
      res.status(200).json(student.fees);
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  };
  const getAllFees = async (req, res) => {
    try {
      // Find all fees in the Fee collection
      const fees = await Fee.find({});
  
      res.status(200).json(fees);
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  };

module.exports = { addFee, updateFeeStatus ,deleteFee, getFeesByStudent,getAllFees };