const jwt = require('jsonwebtoken');
const User = require('../../models/User');

const authMiddleware = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ id: decoded.id });

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

const isStudent = (req, res, next) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ message: 'Access denied. Student privileges required.' });
  }
  next();
};


const enforceSelfAction = (req, res, next) => {
  if (req.user.role === 'student') {
    // Check URL parameters
    if (req.params.userId && req.params.userId !== req.user.id) {
      return res.status(403).json({ message: 'Cannot access other students data' });
    }

    // Check body parameters
    if (req.body.userId && req.body.userId !== req.user.id) {
      return res.status(403).json({ message: 'Cannot perform actions for other students' });
    }

    // For any other ID fields that might be present
    const disallowedIdFields = ['studentId', 'id', 'targetUserId'];
    disallowedIdFields.forEach(field => {
      if (req.body[field] && req.body[field] !== req.user.id) {
        return res.status(403).json({ message: `Cannot specify ${field} for other students` });
      }
    });

    // Always override any ID fields with the authenticated student's ID
    req.params.userId = req.user.id;
    if (req.body) {
      req.body.userId = req.user.id;
    }
  }
  next();
};

const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admins only.' });
  }
  next();
};

const isDoctor = (req, res, next) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Access denied. Doctors only.' });
  }
  next();
};
const isTa = (req, res, next) => {
  if (req.user.role !== 'ta') {
    return res.status(403).json({ message: 'Access denied. Tas only.' });
  }
  next();
};
// Add this new middleware function
const canManageProfilePicture = (req, res, next) => {
  // Admins can manage any profile picture
  if (req.user.role === 'admin') {
    return next();
  }
  
  // Students can only manage their own profile picture
  if (req.user.role === 'student') {
    // If no userId specified in params, default to current user
    const targetUserId = req.params.userId || req.user.id;
    
    if (targetUserId !== req.user.id) {
      return res.status(403).json({ 
        message: 'Students can only manage their own profile pictures' 
      });
    }
    
    // Ensure the request is for their own profile
    req.params.userId = req.user.id;
    return next();
  }
  
  // All other roles are denied
  return res.status(403).json({ 
    message: 'Access denied. Admin or student privileges required.' 
  });
};

module.exports = { 
  authMiddleware, 
  isAdmin, 
  isDoctor, 
  isStudent,
  isTa,
  enforceSelfAction,
  canManageProfilePicture
};