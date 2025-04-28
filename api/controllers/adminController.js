const mongoose = require('mongoose');
const Exam = require('../../models/Exam');
const Course = require('../../models/Course');
const User = require('../../models/User');
const { upload, cloudinary } = require('../../config/cloudinary');

// Helper function to distribute students to rooms
const distributeStudentsToRooms = async (courseCode, baseRoom, roomCapacity) => {
  const students = await User.find({ 
    registeredCourses: courseCode,
    role: 'student'
  })
  .sort({ name: 1 }) // Alphabetical by name
  .select('id name');

  const rooms = [];
  let roomNumber = 1;
  let currentRoom = {
    roomNumber: `${baseRoom}-${roomNumber}`,
    students: []
  };

  for (let i = 0; i < students.length; i++) {
    currentRoom.students.push({
      studentId: students[i].id,
      name: students[i].name
    });

    if (currentRoom.students.length >= roomCapacity || i === students.length - 1) {
      rooms.push(currentRoom);
      roomNumber++;
      currentRoom = {
        roomNumber: `${baseRoom}-${roomNumber}`,
        students: []
      };
    }
  }

  return rooms;
};

const addUsers = async (req, res) => {
  let usersData = req.body;

  // Convert single user to array format for unified processing
  if (!Array.isArray(usersData)) {
    usersData = [usersData];
  }

  if (usersData.length === 0) {
    return res.status(400).json({ message: 'Request body should contain at least one user' });
  }

  try {
    const results = {
      success: [],
      errors: []
    };

    // Process each user
    await Promise.all(usersData.map(async (userData) => {
      const {
        name,
        email,
        id,
        password,
        phoneNumber,
        role,
        department,
        academicLevel,
        dateOfBirth,
        gender,
        address,
        status,
        academicAdvisor,
      } = userData;

      try {
        if (!id || !email) {
          throw new Error('ID and email are required');
        }

        // Check if the ID or email already exists
        const existingUserById = await User.findOne({ id });
        const existingUserByEmail = await User.findOne({ email });

        if (existingUserById) {
          throw new Error('User with this ID already exists');
        }

        if (existingUserByEmail) {
          throw new Error('User with this email already exists');
        }

        // Create user object with common fields
        const newUser = {
          name,
          email,
          id,
          password,
          phoneNumber,
          role,
          dateOfBirth,
          gender,
          address,
        };

        // Add role-specific fields
        if (role === 'student') {
          newUser.department = department;
          newUser.academicLevel = academicLevel;
          newUser.status = status;
          newUser.academicAdvisor = academicAdvisor;
        }

        // Handle profile picture if provided
        if (req.files && req.files[id]) {
          const result = await cloudinary.uploader.upload(req.files[id].path);
          newUser.profilePicture = result.secure_url;
        }

        const user = new User(newUser);
        await user.save();

        results.success.push({
          id,
          message: 'User added successfully',
          user: user.toObject()
        });
      } catch (err) {
        results.errors.push({
          id: id || 'N/A',
          message: `Failed to add user: ${err.message}`
        });
      }
    }));

    // Determine response based on results
    if (results.errors.length > 0 && results.success.length === 0) {
      return res.status(400).json({
        message: 'All users failed to add',
        errors: results.errors
      });
    }

    const response = {
      message: results.errors.length > 0 
        ? (usersData.length === 1 ? 'User addition failed' : 'Some users were added successfully') 
        : (usersData.length === 1 ? 'User added successfully' : 'All users were added successfully'),
      ...results
    };

    res.status(results.errors.length > 0 ? 207 : 201).json(response);
  } catch (err) {
    console.error('Error processing users:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Delete a user
const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await User.findOneAndDelete({ id });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Update a user
const updateUser = async (req, res) => {
  const { id } = req.params;
  const {
    email,
    name,
    phoneNumber,
    department,
    academicLevel,
    address,
    status,
    academicAdvisor,
  } = req.body;

  try {
    const user = await User.findOne({ id });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update general fields
    if (email) user.email = email;
    if (name) user.name = name;
    if (phoneNumber) user.phoneNumber = phoneNumber;
    if (address) user.address = address;

    // Update student-specific fields if the user's role is 'student'
    if (user.role === 'student') {
      if (department) user.department = department;
      if (academicLevel) user.academicLevel = academicLevel;
      if (status) user.status = status;
      if (academicAdvisor) user.academicAdvisor = academicAdvisor;
    }

    // Save the updated user
    await user.save();

    res.json({ message: 'User updated successfully', user });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({});
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Add  courses
const addCourses = async (req, res) => {
  let coursesData = req.body;

  // Convert single course to array format for unified processing
  if (!Array.isArray(coursesData)) {
    coursesData = [coursesData];
  }

  if (coursesData.length === 0) {
    return res.status(400).json({ message: 'Request body should contain at least one course' });
  }

  try {
    const results = {
      success: [],
      errors: []
    };

    // Process each course
    await Promise.all(coursesData.map(async (courseData) => {
      const {
        name,
        code,
        doctorId,
        creditHours,
        prerequisites,
        sections,
        lectureSessions,
        semester,
        startDate,
        endDate,
        department,
        capacity,
      } = courseData;

      try {
        if (!code) {
          throw new Error('Course code is required');
        }

        // Check if the course code already exists
        const existingCourse = await Course.findOne({ code });
        if (existingCourse) {
          throw new Error('Course with this code already exists');
        }

        // Check if the doctorId belongs to a user with the role 'doctor'
        const doctor = await User.findOne({ id: doctorId, role: 'doctor' });
        if (!doctor) {
          throw new Error('Invalid doctor ID or user is not a doctor');
        }

        // Initialize sections as empty array if not provided
        const courseSections = sections || [];

        // Validate sections only if they exist
        if (courseSections.length > 0) {
          const sectionIds = courseSections.map(sec => sec.sectionId).filter(Boolean);
          
          // Check for duplicate section IDs within the same course
          const uniqueSectionIds = new Set(sectionIds);
          if (sectionIds.length !== uniqueSectionIds.size) {
            throw new Error('Section IDs must be unique within a course');
          }

          // Check if the total capacity of sections exceeds the course capacity
          const totalSectionCapacity = courseSections.reduce((sum, sec) => sum + (sec.capacity || 0), 0);
          if (capacity && totalSectionCapacity > capacity) {
            throw new Error('Total section capacity exceeds course capacity');
          }

          // Check if TAs assigned to sections are valid
          for (const section of courseSections) {
            if (section.taId) {
              const ta = await User.findOne({ id: section.taId, role: 'ta' });
              if (!ta) {
                throw new Error(`Invalid TA ID (${section.taId}) or user is not a TA.`);
              }
            }
          }
        }

        // Create a new course - ensure all required fields are set
        const course = new Course({
          name,
          code,
          doctorId,
          doctorName: doctor.name,
          creditHours: creditHours || 3, // Default to 3 if not provided
          prerequisites: prerequisites || [],
          sections: courseSections,
          lectureSessions: lectureSessions || [],
          semester: semester || getCurrentTerm(),
          startDate: startDate || new Date(),
          endDate: endDate || new Date(new Date().setMonth(new Date().getMonth() + 4)),
          department: department || 'General',
          capacity: capacity || 30, // Default capacity if not provided
          registeredStudents: [] // Initialize empty array
        });

        // Save the course to the database
        await course.save();

        // Add the course to the doctor's assignedCourses if not already there
        if (!doctor.assignedCourses.includes(course.code)) {
          doctor.assignedCourses.push(course.code);
          await doctor.save();
        }

        // Assign sections to TAs (if TAs are assigned to sections)
        if (courseSections.length > 0) {
          for (const section of courseSections) {
            if (section.taId) {
              const ta = await User.findOne({ id: section.taId, role: 'ta' });
              if (ta && !ta.assignedSections.includes(section.sectionId)) {
                ta.assignedSections.push(section.sectionId);
                await ta.save();
              }
            }
          }
        }

        results.success.push({
          code,
          message: 'Course added successfully',
          course: course.toObject()
        });
      } catch (err) {
        results.errors.push({
          code: code || 'N/A',
          message: `Failed to add course: ${err.message}`
        });
      }
    }));

    // Determine response based on results
    if (results.errors.length > 0 && results.success.length === 0) {
      return res.status(400).json({
        message: 'All courses failed to add',
        errors: results.errors
      });
    }

    const response = {
      message: results.errors.length > 0 
        ? (coursesData.length === 1 ? 'Course addition failed' : 'Some courses were added successfully') 
        : (coursesData.length === 1 ? 'Course added successfully' : 'All courses were added successfully'),
      ...results
    };

    res.status(results.errors.length > 0 ? 207 : 201).json(response);

  } catch (err) {
    console.error('Error processing courses:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Delete a course
const deleteCourse = async (req, res) => {
  const { code } = req.params;

  try {
    // Find the course to be deleted
    const course = await Course.findOne({ code });
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Get all section IDs in the course
    const sectionIds = course.sections.map(sec => sec.sectionId);

    // Remove the course from all students' registeredCourses
    await User.updateMany(
      { registeredCourses: code },
      { $pull: { registeredCourses: code } }
    );

    // Remove all sections of the course from students' registeredSections
    await User.updateMany(
      { registeredSections: { $in: sectionIds } },
      { $pull: { registeredSections: { $in: sectionIds } } }
    );

    // Remove the course from the doctor's assignedCourses
    const doctor = await User.findOne({ id: course.doctorId, role: 'doctor' });
    if (doctor) {
      doctor.assignedCourses = doctor.assignedCourses.filter(courseCode => courseCode !== code);
      await doctor.save();
    }

    // Remove section IDs from TAs' assignedSections
    for (const section of course.sections) {
      if (section.taId) {
        const ta = await User.findOne({ id: section.taId, role: 'ta' });
        if (ta) {
          ta.assignedSections = ta.assignedSections.filter(secId => secId !== section.sectionId);
          await ta.save();
        }
      }
    }

    // Delete the course
    await Course.findOneAndDelete({ code });

    res.json({ message: 'Course deleted successfully' });
  } catch (err) {
    console.error('Error deleting course:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Update a course
const updateCourse = async (req, res) => {
  const { code } = req.params;
  const {
    doctorId,
    creditHours,
    prerequisites,
    sections,
    lectureSessions,
    semester,
    startDate,
    endDate,
    department,
    capacity,
  } = req.body;

  try {
    const course = await Course.findOne({ code });
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Update the doctor's assignedCourses if the doctorId changes
    if (doctorId && course.doctorId !== doctorId) {
      const oldDoctor = await User.findOne({ id: course.doctorId, role: 'doctor' });
      if (oldDoctor) {
        oldDoctor.assignedCourses = oldDoctor.assignedCourses.filter(courseCode => courseCode !== code);
        await oldDoctor.save();
      }

      const newDoctor = await User.findOne({ id: doctorId, role: 'doctor' });
      if (newDoctor) {
        newDoctor.assignedCourses.push(code);
        await newDoctor.save();
      }
    }

    // Update the course details
    course.doctorId = doctorId || course.doctorId;
    course.creditHours = creditHours || course.creditHours;
    course.prerequisites = prerequisites || course.prerequisites;
    course.sections = sections || course.sections;
    course.lectureSessions = lectureSessions || course.lectureSessions;
    course.semester = semester || course.semester;
    course.startDate = startDate || course.startDate;
    course.endDate = endDate || course.endDate;
    course.department = department || course.department;
    course.capacity = capacity || course.capacity;

    // Save the updated course
    await course.save();

    // Update TAs' assignedSections if sections are updated
    if (sections) {
      for (const section of sections) {
        if (section.taId) {
          const ta = await User.findOne({ id: section.taId, role: 'ta' });
          if (ta && !ta.assignedSections.includes(section.sectionId)) {
            ta.assignedSections.push(section.sectionId);
            await ta.save();
          }
        }
      }
    }

    res.json({ message: 'Course updated successfully', course });
  } catch (err) {
    console.error('Error updating course:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get all courses
const getAllCourses = async (req, res) => {
  try {
    const courses = await Course.find({});
    res.status(200).json(courses);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Get courses by doctor
const getCoursesByDoctor = async (req, res) => {
  const { doctorId } = req.params;

  try {
    // Find all courses taught by the doctor
    const courses = await Course.find({ doctorId });

    if (courses.length === 0) {
      return res.status(404).json({ message: 'No courses found for this doctor' });
    }

    // Fetch the doctor's details
    const doctor = await User.findOne({ id: doctorId, role: 'doctor' });

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    // Include the doctor's name in the response
    const response = {
      doctor: {
        id: doctor.id,
        name: doctor.name,
        email: doctor.email,
      },
      courses: courses.map(course => ({
        ...course.toObject(),
      })),
    };

    res.status(200).json(response);
  } catch (err) {
    console.error('Error fetching courses by doctor:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Add a new section to a course
const addSection = async (req, res) => {
  const { courseCode } = req.params;
  const { sectionId, taId, capacity, sessions } = req.body;

  try {
    const course = await Course.findOne({ code: courseCode });
    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    // Check if the sectionId already exists in the course
    const existingSection = course.sections.find(sec => sec.sectionId === sectionId);
    if (existingSection) {
      return res.status(400).json({ message: 'Section with this ID already exists.' });
    }

    // Check if the taId is a valid TA
    if (taId) {
      const ta = await User.findOne({ id: taId, role: 'ta' });
      if (!ta) {
        return res.status(400).json({ message: 'Invalid TA ID or user is not a TA.' });
      }
    }

    // Check if adding this section exceeds the course's overall capacity
    const totalSectionCapacity = course.sections.reduce((sum, sec) => sum + sec.capacity, 0) + capacity;
    if (totalSectionCapacity > course.capacity) {
      return res.status(400).json({ message: 'Adding this section exceeds the course capacity.' });
    }

    const newSection = { sectionId, taId, capacity, sessions, registeredStudents: [] };

    course.sections.push(newSection);
    await course.save();

    // Add the section to the TA's assignedSections
    if (taId) {
      const ta = await User.findOne({ id: taId, role: 'ta' });
      if (ta) {
        ta.assignedSections.push(sectionId);
        await ta.save();
      }
    }

    return res.status(201).json({
      message: 'Section added successfully.',
      section: newSection,
    });
  } catch (error) {
    console.error('Error adding section:', error);
    return res.status(500).json({ message: 'An error occurred while adding the section.' });
  }
};

// Delete a section from a course
const deleteSection = async (req, res) => {
  const { courseCode, sectionId } = req.params;

  try {
    const course = await Course.findOne({ code: courseCode });
    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    // Find the section by its custom sectionId
    const sectionIndex = course.sections.findIndex(sec => sec.sectionId === sectionId);
    if (sectionIndex === -1) {
      return res.status(404).json({ message: 'Section not found.' });
    }

    const section = course.sections[sectionIndex];

    // Remove the section from all students' registeredSections
    await User.updateMany(
      { registeredSections: sectionId },
      { $pull: { registeredSections: sectionId } }
    );

    // Remove the section from the TA's assignedSections
    if (section.taId) {
      const ta = await User.findOne({ id: section.taId, role: 'ta' });
      if (ta) {
        ta.assignedSections = ta.assignedSections.filter(secId => secId !== sectionId);
        await ta.save();
      }
    }

    // Remove the section from the course
    course.sections.splice(sectionIndex, 1);
    await course.save();

    return res.status(200).json({ message: 'Section deleted successfully.' });
  } catch (error) {
    console.error('Error deleting section:', error);
    return res.status(500).json({ message: 'An error occurred while deleting the section.' });
  }
};

// Update a section in a course
const updateSection = async (req, res) => {
  const { courseCode, sectionId } = req.params;
  const { newSectionId, newSessions, taId, capacity } = req.body;

  try {
    const course = await Course.findOne({ code: courseCode });
    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    // Find the section by its custom sectionId
    const section = course.sections.find(sec => sec.sectionId === sectionId);
    if (!section) {
      return res.status(404).json({ message: 'Section not found.' });
    }

    // If the sectionId is being updated, remove the old sectionId from students' profiles
    if (newSectionId && newSectionId !== sectionId) {
      await User.updateMany(
        { registeredSections: sectionId },
        { $pull: { registeredSections: sectionId } }
      );

      // Update the sectionId
      section.sectionId = newSectionId;
    }

    // Update other section properties
    if (newSessions) section.sessions = newSessions;
    if (capacity) section.capacity = capacity;

    // Handle TA assignment
    if (taId) {
      const ta = await User.findOne({ id: taId, role: 'ta' });
      if (!ta) {
        return res.status(400).json({ message: 'Invalid TA ID or user is not a TA.' });
      }

      // Remove the section from the old TA's assignedSections
      if (section.taId) {
        const oldTA = await User.findOne({ id: section.taId });
        if (oldTA) {
          oldTA.assignedSections = oldTA.assignedSections.filter(secId => secId !== sectionId);
          await oldTA.save();
        }
      }

      // Assign the new TA
      section.taId = taId;
      ta.assignedSections.push(section.sectionId);
      await ta.save();
    } else if (section.taId) {
      // If no new TA is provided, remove the section from the old TA's assignedSections
      const oldTA = await User.findOne({ id: section.taId });
      if (oldTA) {
        oldTA.assignedSections = oldTA.assignedSections.filter(secId => secId !== sectionId);
        await oldTA.save();
      }
      section.taId = undefined;
    }

    await course.save();

    return res.status(200).json({
      message: 'Section updated successfully.',
      section,
    });
  } catch (error) {
    console.error('Error updating section:', error);
    return res.status(500).json({ message: 'An error occurred while updating the section.', error: error.message });
  }
};

// Get all sections for all courses (admin only)
const getAllSections = async (req, res) => {
  try {
    const courses = await Course.find({});

    // Manually populate taId and doctorId
    const populatedCourses = await Promise.all(
      courses.map(async (course) => {
        // Populate doctorId
        const doctor = await User.findOne({ id: course.doctorId, role: 'doctor' }).select('name');
        course.doctorId = doctor ? { name: doctor.name } : null;

        // Populate taId for each section
        course.sections = await Promise.all(
          course.sections.map(async (section) => {
            if (section.taId) {
              const ta = await User.findOne({ id: section.taId, role: 'ta' }).select('name');
              section.taId = ta ? { name: ta.name } : null;
            }
            return section;
          })
        );

        return course;
      })
    );

    const sections = populatedCourses.flatMap(course => course.sections);

    return res.status(200).json({
      message: 'Sections fetched successfully.',
      sections,
    });
  } catch (error) {
    console.error('Error fetching sections:', error);
    return res.status(500).json({
      message: 'An error occurred while fetching sections.',
      error: error.message,
    });
  }
};
// Get All Users' Profile Pictures (Admin Only)
const getAllProfilePictures = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const users = await User.find({}, 'id name profilePicture');
    res.status(200).json({ profilePictures: users });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Add exam with room distribution
// Modified addExam function
const addExam = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      examId,
      courseCode,
      examDate,
      startTime,
      endTime,
      roomNumbers,
      roomCapacity = 30,
      semester,
      academicYear,
      examType = 'Final',
      department
    } = req.body;

    // Validate required fields
    if (!roomNumbers || !Array.isArray(roomNumbers) || roomNumbers.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Please provide an array of room numbers' 
      });
    }

    // Validate examDate format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Invalid exam date format. Please use YYYY-MM-DD' 
      });
    }

    // Check if exam with same ID already exists for this department
    const existingExam = await Exam.findOne({ 
      examId,
      department 
    }).session(session);

    if (existingExam) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: `Exam with ID ${examId} already exists for department ${department}`,
        existingExam: {
          id: existingExam._id,
          courseCode: existingExam.courseCode,
          examDate: existingExam.examDate
        }
      });
    }

    // Get course and enrolled students
    const course = await Course.findOne({ code: courseCode }).session(session);
    if (!course) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Course not found' });
    }

    const students = await User.find({
      id: { $in: course.registeredStudents },
      role: 'student'
    })
    .sort({ name: 1 })
    .session(session);

    // Distribute students to rooms
    const rooms = [];
    let currentRoomIndex = 0;
    let studentsAssigned = 0;

    while (studentsAssigned < students.length && currentRoomIndex < roomNumbers.length) {
      const roomNumber = roomNumbers[currentRoomIndex];
      const roomStudents = [];
      
      const remainingStudents = students.length - studentsAssigned;
      const studentsInThisRoom = Math.min(roomCapacity, remainingStudents);

      for (let i = 0; i < studentsInThisRoom; i++) {
        roomStudents.push({
          studentId: students[studentsAssigned + i].id,
          name: students[studentsAssigned + i].name
        });
      }

      rooms.push({
        roomNumber,
        students: roomStudents
      });

      studentsAssigned += studentsInThisRoom;
      currentRoomIndex++;
    }

    if (studentsAssigned < students.length) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `Not enough room capacity. ${students.length - studentsAssigned} students could not be assigned.`,
        requiredRooms: Math.ceil(students.length / roomCapacity)
      });
    }

    // Create exam document
    const exam = new Exam({
      examId,
      courseCode,
      courseName: course.name,
      examDate,
      startTime,
      endTime,
      roomNumbers,
      rooms,
      roomCapacity,
      semester,
      academicYear,
      examType,
      department
    });

    await exam.save({ session });

    // Update students with their room assignments
    const bulkOps = students.map(student => {
      const room = rooms.find(r => 
        r.students.some(s => s.studentId === student.id)
      );
      
      return {
        updateOne: {
          filter: { id: student.id },
          update: {
            $addToSet: { exams: exam._id },
            $set: { 
              [`examRooms.${exam._id}`]: room.roomNumber
            }
          }
        }
      };
    });

    await User.bulkWrite(bulkOps, { session });
    await session.commitTransaction();
    
    res.status(201).json({
      success: true,
      message: 'Exam created with room assignments',
      exam: {
        id: exam._id,
        examId: exam.examId,
        course: exam.courseCode,
        department: exam.department,
        totalStudents: students.length,
        rooms: rooms.map(room => ({
          roomNumber: room.roomNumber,
          studentCount: room.students.length
        }))
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Exam creation failed:', error);
    res.status(500).json({
      success: false,
      message: 'Exam creation failed',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// Update deleteExam
const deleteExam = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { examId } = req.params;

    // 1. Find the exam
    const exam = await Exam.findOne({ examId }).session(session);
    if (!exam) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Exam not found' });
    }

    // 2. Get all student IDs from exam rooms
    const studentIds = exam.rooms.flatMap(room => 
      room.students.map(student => student.studentId)
    );

    // 3. Remove exam from students' profiles
    await User.updateMany(
      { id: { $in: studentIds } },
      { 
        $pull: { exams: exam._id },
        $unset: { [`examRooms.${exam._id}`]: "" }
      },
      { session }
    );

    // 4. Delete the exam
    await Exam.deleteOne({ examId }).session(session);

    await session.commitTransaction();
    
    res.json({ 
      message: 'Exam deleted successfully',
      deletedExamId: examId,
      affectedStudents: studentIds.length
    });

  } catch (err) {
    await session.abortTransaction();
    console.error('Error deleting exam:', err);
    res.status(500).json({ 
      message: 'Failed to delete exam',
      error: err.message 
    });
  } finally {
    session.endSession();
  }
};

// Update updateExam
const updateExam = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { examId } = req.params;
    const updateData = req.body;

    // 1. Find the exam
    const exam = await Exam.findOne({ examId }).session(session);
    if (!exam) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Exam not found' });
    }

    // 2. Handle course code change (if any)
    if (updateData.courseCode && updateData.courseCode !== exam.courseCode) {
      const course = await Course.findOne({ code: updateData.courseCode }).session(session);
      if (!course) {
        await session.abortTransaction();
        return res.status(404).json({ message: 'New course not found' });
      }
      updateData.courseName = course.name;
    }

    // 3. Handle room changes
    let affectedStudents = [];
    if (updateData.roomNumbers || updateData.roomCapacity) {
      const newRoomNumbers = updateData.roomNumbers || exam.roomNumbers;
      const newRoomCapacity = updateData.roomCapacity || exam.roomCapacity;

      // Get current student assignments
      const currentStudents = exam.rooms.flatMap(room => room.students);

      // Redistribute students
      const newRooms = [];
      let roomIndex = 0;
      let studentsAssigned = 0;

      while (studentsAssigned < currentStudents.length && roomIndex < newRoomNumbers.length) {
        const roomStudents = currentStudents.slice(
          studentsAssigned,
          studentsAssigned + newRoomCapacity
        );

        newRooms.push({
          roomNumber: newRoomNumbers[roomIndex],
          students: roomStudents
        });

        studentsAssigned += roomStudents.length;
        roomIndex++;
      }

      if (studentsAssigned < currentStudents.length) {
        await session.abortTransaction();
        return res.status(400).json({
          message: 'Not enough room capacity for all students',
          requiredRooms: Math.ceil(currentStudents.length / newRoomCapacity)
        });
      }

      updateData.rooms = newRooms;
      affectedStudents = currentStudents.map(s => s.studentId);
    }

    // 4. Update exam document
    const updatedExam = await Exam.findOneAndUpdate(
      { examId },
      { $set: updateData },
      { new: true, session }
    );

    // 5. Update student records if rooms changed
    if (affectedStudents.length > 0) {
      const roomAssignments = {};
      updatedExam.rooms.forEach(room => {
        room.students.forEach(student => {
          roomAssignments[student.studentId] = room.roomNumber;
        });
      });

      await User.updateMany(
        { id: { $in: affectedStudents } },
        { $set: { [`examRooms.${updatedExam._id}`]: roomAssignments[req.user.id] } },
        { session }
      );
    }

    await session.commitTransaction();

    res.json({
      message: 'Exam updated successfully',
      exam: updatedExam,
      updatedStudents: affectedStudents.length
    });

  } catch (err) {
    await session.abortTransaction();
    console.error('Error updating exam:', err);
    res.status(500).json({
      message: 'Failed to update exam',
      error: err.message
    });
  } finally {
    session.endSession();
  }
};

const getAllExams = async (req, res) => {
  try {
    // 1. Get all exams sorted by date and time
    const exams = await Exam.find({})
      .sort({ examDate: 1, startTime: 1 })
      .lean(); // Use lean() for better performance with plain JavaScript objects

    // 2. Get all unique course codes from the exams
    const courseCodes = [...new Set(exams.map(exam => exam.courseCode))];
    
    // 3. Get course details in a single query
    const courses = await Course.find(
      { code: { $in: courseCodes } },
      'code name registeredStudents'
    );

    // 4. Create a course lookup map for quick access
    const courseMap = courses.reduce((map, course) => {
      map[course.code] = {
        name: course.name,
        registeredStudents: course.registeredStudents.length
      };
      return map;
    }, {});

    // 5. Format the response with course details
    const formattedExams = exams.map(exam => {
      const courseInfo = courseMap[exam.courseCode] || {
        name: 'Unknown Course',
        registeredStudents: 0
      };

      return {
        examId: exam.examId,
        courseCode: exam.courseCode,
        courseName: courseInfo.name,
        examDate: exam.examDate,
        startTime: exam.startTime,
        endTime: exam.endTime,
        roomNumbers: exam.roomNumbers,
        rooms: exam.rooms.map(room => ({
          roomNumber: room.roomNumber,
          studentCount: room.students.length,
          students: room.students.map(s => ({
            studentId: s.studentId,
            name: s.name
          }))
        })),
        semester: exam.semester,
        academicYear: exam.academicYear,
        examType: exam.examType,
        registeredStudents: courseInfo.registeredStudents,
        department: exam.department
      };
    });

    res.status(200).json(formattedExams);
  } catch (err) {
    console.error('Error fetching exams:', err);
    res.status(500).json({ 
      message: 'Failed to retrieve exams',
      error: err.message 
    });
  }
};



module.exports = { addUsers, deleteUser, updateUser, getAllUsers ,addCourses ,deleteCourse ,updateCourse ,getAllCourses,getCoursesByDoctor ,
  addSection, deleteSection, updateSection, getAllSections,getAllProfilePictures, addExam,updateExam,deleteExam,getAllExams};