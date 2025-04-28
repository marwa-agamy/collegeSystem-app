const Announcement = require('../../models/Announcement');
const User = require('../../models/User');
const Course = require('../../models/Course');

const generateAnnouncementId = () => `announce-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const sendAnnouncement = async (req, res) => {
  try {
    const { title, content, courseCode, sectionId } = req.body;
    const senderId = req.user.id;
    const senderRole = req.user.role;

    // Validate required fields
    if (!title || !content) {
      return res.status(400).json({
        status: 'error',
        message: 'Title and content are required'
      });
    }

    // Validate content length
    if (content.length > 5000) {
      return res.status(400).json({
        status: 'error',
        message: 'Content exceeds maximum length of 5000 characters'
      });
    }

    // Get sender details
    const sender = await User.findOne({ id: senderId })
      .select('name profilePicture role');
    
    if (!sender) {
      return res.status(404).json({
        status: 'error',
        message: 'Sender not found'
      });
    }

    // Validate course reference if provided
    if (courseCode) {
      const courseExists = await Course.exists({ code: courseCode });
      if (!courseExists) {
        return res.status(400).json({ 
          status: 'error',
          message: 'Invalid course code' 
        });
      }

      // Verify doctor is assigned to course
      if (senderRole === 'doctor') {
        const isCourseDoctor = await Course.exists({
          code: courseCode,
          doctorId: senderId
        });
        if (!isCourseDoctor) {
          return res.status(403).json({
            status: 'error',
            message: 'Not authorized for this course'
          });
        }
      }
    }

    // Validate section reference if provided
    if (sectionId) {
      const sectionExists = await Course.exists({ 
        'sections.sectionId': sectionId 
      });
      if (!sectionExists) {
        return res.status(400).json({ 
          status: 'error',
          message: 'Invalid section ID' 
        });
      }

      // Verify TA is assigned to section
      if (senderRole === 'ta') {
        const isSectionTA = await Course.exists({
          'sections.sectionId': sectionId,
          'sections.taId': senderId
        });
        if (!isSectionTA) {
          return res.status(403).json({
            status: 'error',
            message: 'Not authorized for this section'
          });
        }
      }
    }

    // Create announcement
    const announcement = new Announcement({
      announcementId: generateAnnouncementId(),
      sender: senderId,
      senderDetails: {
        name: sender.name,
        profilePicture: sender.profilePicture,
        role: sender.role
      },
      title,
      content,
      courseCode,
      sectionId
    });

    // Save with retry for duplicate IDs
    let savedAnnouncement;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        savedAnnouncement = await announcement.save();
        break;
      } catch (err) {
        if (err.code === 11000 && err.keyPattern.announcementId) {
          announcement.announcementId = generateAnnouncementId();
          attempts++;
          if (attempts === maxAttempts) throw err;
        } else {
          throw err;
        }
      }
    }

    res.status(201).json({
      status: 'success',
      announcement: {
        announcementId: savedAnnouncement.announcementId,
        title: savedAnnouncement.title,
        content: savedAnnouncement.content,
        sender: {
          id: senderId,
          name: sender.name,
          profilePicture: sender.profilePicture,
          role: sender.role
        },
        courseCode: savedAnnouncement.courseCode,
        sectionId: savedAnnouncement.sectionId,
        createdAt: savedAnnouncement.createdAt
      }
    });

  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Server error',
      error: err.message
    });
  }
};

const deleteAnnouncement = async (req, res) => {
  try {
    const { announcementId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const announcement = await Announcement.findOne({ announcementId });
    
    if (!announcement) {
      return res.status(404).json({
        status: 'error',
        message: 'Announcement not found'
      });
    }

    // Authorization check
    if (userRole !== 'admin' && announcement.sender !== userId) {
      return res.status(403).json({
        status: 'error',
        message: 'Only admins or the original sender can delete announcements'
      });
    }

    // Soft delete
    announcement.isDeleted = true;
    announcement.deletedBy = userId;
    announcement.deletedAt = new Date();
    
    await announcement.save();

    res.status(200).json({
      status: 'success',
      message: 'Announcement deleted successfully',
      announcementId: announcement.announcementId,
      deletedAt: announcement.deletedAt
    });

  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Server error',
      error: err.message
    });
  }
};

// Update getStudentAnnouncements to filter out deleted announcements
const getStudentAnnouncements = async (req, res) => {
  try {
    const studentId = req.user.id;

    // Get student's registered courses and sections
    const student = await User.findOne({ id: studentId })
      .select('registeredCourses registeredSections');

    if (!student) {
      return res.status(404).json({
        status: 'error',
        message: 'Student not found'
      });
    }

    // Get all relevant courses for name mapping
    const courses = await Course.find({
      code: { $in: student.registeredCourses }
    }).select('code name');

    const courseMap = courses.reduce((map, course) => {
      map[course.code] = course.name;
      return map;
    }, {});

    // Get announcements
    const announcements = await Announcement.find({
      isDeleted: false,
      $or: [
        { 'senderDetails.role': 'admin' },
        { 
          'senderDetails.role': 'doctor',
          courseCode: { $in: student.registeredCourses }
        },
        {
          'senderDetails.role': 'ta',
          sectionId: { $in: student.registeredSections }
        }
      ]
    })
    .sort({ createdAt: -1 });

    // Format response with course names
    const formattedAnnouncements = announcements.map(ann => {
      const response = {
        announcementId: ann.announcementId,
        title: ann.title,
        content: ann.content,
        sender: {
          id: ann.sender,
          name: ann.senderDetails.name,
          profilePicture: ann.senderDetails.profilePicture,
          role: ann.senderDetails.role
        },
        createdAt: ann.createdAt
      };

      // Add course info if exists
      if (ann.courseCode) {
        response.course = {
          code: ann.courseCode,
          name: courseMap[ann.courseCode] || 'Unknown Course'
        };
      }

      // Add section info if exists
      if (ann.sectionId) {
        response.section = {
          id: ann.sectionId
          // You could add section name here if available
        };
      }

      return response;
    });

    res.status(200).json({
      status: 'success',
      announcements: formattedAnnouncements
    });

  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Server error',
      error: err.message
    });
  }
};

module.exports = {
  sendAnnouncement,
  getStudentAnnouncements,
  deleteAnnouncement
};