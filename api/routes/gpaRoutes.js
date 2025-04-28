const express = require('express');
const gpaController = require('../controllers/gpaController');
const { authMiddleware, isAdmin, isDoctor, isStudent } = require('../middleware/authMiddleware');
const isCourseDoctor = require('../middleware/isCourseDoctor');
const router = express.Router();

// Add a grade (doctor only, for their own courses)
router.post('/add-grade', authMiddleware, isDoctor, isCourseDoctor, gpaController.addGrade);

// Read all grades
router.get('/get-all-grades', authMiddleware, isAdmin, gpaController.getAllGrades);

// Read a single grade by ID
router.get('/get-grade/:studentId', authMiddleware, isAdmin, gpaController.getGradeById);

// Update a grade by studentId and courseCode
router.put('/update-grade/:studentId/:courseCode', authMiddleware, isDoctor, gpaController.updateGrade);

// Delete a grade by studentId and courseCode
router.delete('/delete-grade/:studentId/:courseCode', authMiddleware, isDoctor, gpaController.deleteGrade);
// Get all grades for a doctor's course
router.get('/get-grades-for-course/:courseCode', authMiddleware, isDoctor, gpaController.getGradesForDoctorCourse);

// Get a specific student's grade in a doctor's course
router.get('/get-student-grade/:courseCode/:studentId', authMiddleware, isDoctor, gpaController.getStudentGradeInDoctorCourse);

// Get student performance (student or admin)
router.get('/performance/:studentId',authMiddleware,isStudent, gpaController.getStudentPerformance);

module.exports = router;