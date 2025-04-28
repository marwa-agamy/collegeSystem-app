const Course = require('../../models/Course');

const isCourseDoctor = async (req, res, next) => {
  const { courseCode } = req.body;
  const doctorId = req.user.id; 

  try {
    // Find the course
    const course = await Course.findOne({ code: courseCode, doctorId });
    if (!course) {
      return res.status(403).json({ message: 'You are not authorized to add grades for this course' });
    }

    next();
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = isCourseDoctor;