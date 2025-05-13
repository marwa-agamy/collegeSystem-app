const Complaint = require('../../models/Complaint');
const User = require('../../models/User');

// Send a complaint
const sendComplaint = async (req, res) => {
  const {complaintId, userId, role, complaint } = req.body;

  try {
    // Check if the user exists
    const user = await User.findOne({ id: userId, role });
    if (!user) {
      return res.status(404).json({ message: 'User not found or role mismatch' });
    }

    // Create a new complaint
    const newComplaint = new Complaint({
      complaintId,
      userId,
      role,
      complaint
    });

    await newComplaint.save();

    res.status(201).json({ message: 'Complaint sent successfully', complaint: newComplaint });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get all complaints (for admin)
const getAllComplaints = async (req, res) => {
    try {
      // Find all complaints
      const complaints = await Complaint.find({});
  
      // Manually populate the userId field
      const populatedComplaints = await Promise.all(
        complaints.map(async (complaint) => {
          const user = await User.findOne({ id: complaint.userId }).select('name email');
          return {
            ...complaint.toObject(),
            userId: user ? { name: user.name, email: user.email } : null,
          };
        })
      );
  
      res.status(200).json(populatedComplaints);
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  };

// Resolve a complaint (for admin)
const resolveComplaint = async (req, res) => {
  const { complaintId } = req.params;

  try {
    // Find the complaint by its custom `complaintId` field
    const complaint = await Complaint.findOne({ complaintId });

    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    // Update the complaint status and resolvedAt timestamp
    complaint.status = 'Resolved';
    complaint.resolvedAt = Date.now();
    await complaint.save();

    res.status(200).json({ message: 'Complaint resolved successfully', complaint });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { sendComplaint, getAllComplaints, resolveComplaint };