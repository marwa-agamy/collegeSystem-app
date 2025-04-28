const express = require('express');
const { login , changePassword , forgotPassword, resetPassword,updateProfilePicture,getProfilePicture,deleteProfilePicture} = require('../controllers/authController');
const { authMiddleware,canManageProfilePicture } = require('../middleware/authMiddleware');
const { upload } = require('../../config/cloudinary');
const router = express.Router();

router.get('/', (req, res) => {
    res.json({ message: 'Auth route is working!' });
  });
router.post('/login', login);
router.post('/change-password', authMiddleware ,changePassword); 
router.post('/forgot-password', forgotPassword); 
router.post('/reset-password', resetPassword); 
router.put('/update-profile-picture/:userId?', authMiddleware,canManageProfilePicture, upload.single('profilePicture'), updateProfilePicture);
router.get('/get-profile-picture/:userId?', authMiddleware,canManageProfilePicture, getProfilePicture);
router.delete('/delete-profile-picture/:userId?', authMiddleware,canManageProfilePicture, deleteProfilePicture);
module.exports = router;
