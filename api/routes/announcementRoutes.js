const express = require('express');
const { 
  sendAnnouncement,
  getStudentAnnouncements,
  deleteAnnouncement
} = require('../controllers/announcementController');
const { authMiddleware, isAdmin, isDoctor,isStudent, isTa } = require('../middleware/authMiddleware');

const router = express.Router();

// Send announcement
router.post('/send', authMiddleware, (req, res, next) => {
  if (req.user.role === 'admin') return isAdmin(req, res, next);
  if (req.user.role === 'doctor') return isDoctor(req, res, next);
  if (req.user.role === 'ta') return isTa(req, res, next);
  return res.status(403).json({ message: 'Access denied' });
}, sendAnnouncement);

// Get announcements
router.get('/get-announcement', authMiddleware,isStudent, getStudentAnnouncements);

// Delete announcement
router.delete('/delete/:announcementId', authMiddleware, deleteAnnouncement);

module.exports = router;