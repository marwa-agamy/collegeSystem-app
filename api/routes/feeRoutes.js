const express = require('express');
const { addFee,  updateFeeStatus, deleteFee, getFeesByStudent,getAllFees }= require('../controllers/feeController');
const { authMiddleware, isAdmin , isStudent } = require('../middleware/authMiddleware'); // Assuming you have authentication middleware

const router = express.Router();

// Add a new fee (admin only)
router.post('/add-fee', authMiddleware, isAdmin, addFee);

// Update a fee (admin only)
router.put('/update-fee/:feeId/:studentId', authMiddleware, isAdmin, updateFeeStatus);

// Delete a fee (admin only)
router.delete('/delete-fee/:feeId', authMiddleware, isAdmin, deleteFee);

// Get all fees for a student (student and admin)
router.get('/get-fee-Bystudent/:studentId', authMiddleware, isStudent , getFeesByStudent);

// Get all fees (admin only)
router.get('/get-all-fees', authMiddleware, isAdmin, getAllFees);

module.exports = router;