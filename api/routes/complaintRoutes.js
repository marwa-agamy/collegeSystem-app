const express = require('express');
const {sendComplaint, getAllComplaints, resolveComplaint } = require('../controllers/complaintController');
const { authMiddleware, isAdmin } = require('../middleware/authMiddleware');
const router = express.Router();


router.post('/send-complaints',authMiddleware, sendComplaint);
router.get('/get-complaints', authMiddleware, isAdmin , getAllComplaints); 
router.put('/resolve/:complaintId',authMiddleware,isAdmin ,resolveComplaint); 


module.exports = router;