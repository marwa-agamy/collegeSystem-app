const express = require('express');
const { authMiddleware ,isStudent, enforceSelfAction  } = require('../middleware/authMiddleware');
const {registerForCourses, registerForSections,dropCourse,dropSection, getAvailableCourses,getCourseSections,generateTimetable,getStudentExams} = require('../controllers/studentController');
const router = express.Router();
router.use(authMiddleware, isStudent);
// Student routes for course and section registration
router.post('/register-course/:userId' ,enforceSelfAction, registerForCourses);
router.post('/register-section/:userId' , enforceSelfAction,registerForSections);
router.post('/drop-course/:userId',enforceSelfAction, dropCourse);
router.post('/drop-section/:userId',enforceSelfAction, dropSection);
router.get('/available-courses/:userId',enforceSelfAction,getAvailableCourses);
router.get('/course-sections/:courseCode/:userId',enforceSelfAction, getCourseSections);
router.get('/time-table/:userId',enforceSelfAction,generateTimetable);
// Student exam view route
router.get('/exams/:userId', enforceSelfAction, getStudentExams);
module.exports = router;