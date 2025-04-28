const express = require('express');
const { authMiddleware, isAdmin } = require('../middleware/authMiddleware');
const { upload } = require('../../config/cloudinary');
const {addUsers, deleteUser, updateUser, getAllUsers, addCourses, 
   deleteCourse, updateCourse, getAllCourses,getCoursesByDoctor,
   addSection, deleteSection, updateSection, getAllSections,getAllProfilePictures,addExam,updateExam,deleteExam,getAllExams} = require('../controllers/adminController');

const router = express.Router();

// Apply authentication to all routes
router.use(authMiddleware);

// User management routes (admin only)
router.post('/add-user', isAdmin, upload.single('profilePicture'), addUsers);
router.delete('/delete-user/:id', isAdmin, deleteUser);
router.put('/update-user/:id', isAdmin, updateUser);
router.get('/users', isAdmin, getAllUsers);


// Course management routes (admin only)
router.post('/add-course', isAdmin, addCourses);
router.delete('/delete-course/:code', isAdmin, deleteCourse);
router.put('/update-course/:code', isAdmin, updateCourse);
router.get('/courses', isAdmin, getAllCourses);
router.get('/coursesByDoctors/:doctorId', isAdmin, getCoursesByDoctor);

// Section management routes (admin only)
router.post('/add-section/:courseCode', isAdmin, addSection);
router.delete('/delete-section/:courseCode/:sectionId', isAdmin, deleteSection);
router.put('/update-section/:courseCode/:sectionId', isAdmin, updateSection);
router.get('/sections', isAdmin, getAllSections);

router.get('/all-profile-pictures', isAdmin, getAllProfilePictures);

// Exam management routes (admin only)
router.post('/add-exam', isAdmin, addExam);
router.put('/update-exam/:examId', isAdmin, updateExam);
router.delete('/delete-exam/:examId', isAdmin, deleteExam);
router.get('/exams', isAdmin, getAllExams);

module.exports = router;