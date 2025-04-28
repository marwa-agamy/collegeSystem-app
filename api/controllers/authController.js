const crypto = require('crypto');
const User = require('../../models/User');
const sendEmail = require('../../utils/email');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { upload, cloudinary } = require('../../config/cloudinary');


// Login user
// Login user
const login = async (req, res) => {
  const { id, password } = req.body;

  try {
    console.log('Login request received:', { id, password }); // Debugging

    // Find user by custom `id` field
    const user = await User.findOne({ id });
    console.log('User found:', user); // Debugging

    if (!user) {
      console.log('User not found'); // Debugging
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check if the password is correct
    const isMatch = await bcrypt.compare(password, user.password);
    console.log('Password match:', isMatch); // Debugging

    if (!isMatch) {
      console.log('Password mismatch'); // Debugging
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Create token payload with custom `id` field
    const payload = { id: user.id, role: user.role , selfOnly: user.role === 'student' };

    // Generate JWT token
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
    console.log('Token generated:', token); // Debugging

    // Send token and user details in the response
    const userResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    // Add student-specific fields if role is student
    if (user.role === 'student') {
      userResponse.academicLevel = user.academicLevel;
      
      // Use CGPA from performance object if available, otherwise fall back to the array method
      if (user.performance && user.performance.cgpa !== undefined) {
        userResponse.cgpa = user.performance.cgpa;
      } else {
        userResponse.cgpa = Array.isArray(user.cgpa) && user.cgpa.length > 0 ? user.cgpa[0] : 0;
      }
    }

    // Send token and user details in the response
    res.json({
      token,
      user: userResponse,
    });
  } catch (err) {
    console.error('Error logging in:', err.message); // Debugging
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Change password
const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id; // Get the user ID from the authenticated request

  try {
    // Find the user by custom `id` field
    const user = await User.findOne({ id: userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if the current password is correct
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Hash the new password and save it
    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Error changing password:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Generate a random OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
};

// Forgot password - Generate and send OTP via email
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).send({ message: 'Please provide email' });
    }

    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).send({ message: 'User not found' });
    }

    // Generate OTP and set expiry (5 minutes from now)
    const otp = generateOTP(); // Assume generateOTP() generates a 6-digit OTP
    const otpExpire = Date.now() + 300000; // 5 minutes

    // Save OTP and expiry to the user
    user.otp = otp;
    user.otpExpire = otpExpire;
    await user.save();

    // Send OTP via email
    const emailText = `Your OTP for password reset is: ${otp}\n\nThis OTP will expire in 5 minutes.`;
    await sendEmail(email, 'Password Reset OTP', emailText);

    return res.status(200).send({
      message: 'OTP sent to your email',
      otp, // For testing purposes only (remove in production)
    });
  } catch (error) {
    console.error('Error in forgotPassword:', error.message);
    return res.status(500).send({ message: 'Server error', error: error.message });
  }
};

// Reset password - Verify OTP and set new password
const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).send({ message: 'Please provide email, OTP, and new password' });
    }

    // Debugging: Log the request data
    console.log('Reset password request:', { email, otp, newPassword });

    // Find the user by email, OTP, and check if OTP is still valid
    const user = await User.findOne({
      email,
      otp,
      otpExpire: { $gt: Date.now() }, // Check if OTP is still valid
    });

    // Debugging: Log the user found
    console.log('User found:', user);

    if (!user) {
      return res.status(400).send({ message: 'Invalid or expired OTP' });
    }

// Update the password (it will be hashed by the pre-save hook)
user.password = newPassword;
user.otp = undefined; // Clear OTP
user.otpExpiry = undefined; // Clear OTP expiry
await user.save(); // Save the user (password will be hashed automatically)


    return res.status(200).send({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error in resetPassword:', error.message); // Log the error for debugging
    return res.status(500).send({ message: 'Server error', error: error.message });
  }
};

const updateProfilePicture = async (req, res) => {
  try {
    const userId = req.user.role === 'admin' ? req.params.userId || req.user.id : req.user.id;
    const user = await User.findOne({ id: userId });

    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    // Delete old picture if exists
    if (user.profilePicture) {
      const oldPublicId = user.profilePicture.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`profile_pictures/${oldPublicId}`);
    }

    // Upload new picture
    const result = await cloudinary.uploader.upload(req.file.path, { folder: 'profile_pictures' });
    user.profilePicture = result.secure_url;
    await user.save();

    res.status(200).json({ message: 'Profile picture updated successfully', profilePicture: user.profilePicture });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

//Get Profile Picture (Admin for Any User & Other Roles for Themselves)
const getProfilePicture = async (req, res) => {
  try {
    const userId = req.user.role === 'admin' ? req.params.userId || req.user.id : req.user.id;
    const user = await User.findOne({ id: userId });

    if (!user || !user.profilePicture) {
      return res.status(404).json({ message: 'Profile picture not found' });
    }

    res.status(200).json({ profilePicture: user.profilePicture });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Delete Profile Picture (Admin for Any User & Other Roles for Themselves)
const deleteProfilePicture = async (req, res) => {
  try {
    const userId = req.user.role === 'admin' ? req.params.userId || req.user.id : req.user.id;
    const user = await User.findOne({ id: userId });

    if (!user || !user.profilePicture) {
      return res.status(404).json({ message: 'Profile picture not found' });
    }

    // Extract public_id from the Cloudinary URL
    const publicId = user.profilePicture.split('/').pop().split('.')[0]; 

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(`profile_pictures/${publicId}`);

    // Remove the image reference from the database
    user.profilePicture = '';
    await user.save();

    res.status(200).json({ message: 'Profile picture deleted successfully' });
  } catch (err) {
    console.error('Error deleting profile picture:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};



module.exports = { login, changePassword, forgotPassword, resetPassword,updateProfilePicture,getProfilePicture,deleteProfilePicture};
