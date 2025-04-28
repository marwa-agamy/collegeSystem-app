const Course = require('../../models/Course');
const User = require('../../models/User');
const Grade = require('../../models/Grade');
const Exam = require('../../models/Exam');
const mongoose = require('mongoose');

function isTimeConflict(session1, session2) {
  if (session1.day !== session2.day) return false;

  const toMinutes = (time) => {
    if (!time) {
      console.error("Invalid time format:", time);
      return NaN;
    }

    const match = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) {
      console.error("Time parsing failed for:", time);
      return NaN;
    }

    let [_, hour, minute, period] = match;
    hour = parseInt(hour, 10);
    minute = parseInt(minute, 10);

    if (period.toUpperCase() === 'PM' && hour !== 12) {
      hour += 12;
    } else if (period.toUpperCase() === 'AM' && hour === 12) {
      hour = 0;
    }

    return hour * 60 + minute;
  };

  const start1 = toMinutes(session1.startTime);
  const end1 = toMinutes(session1.endTime);
  const start2 = toMinutes(session2.startTime);
  const end2 = toMinutes(session2.endTime);

  if (isNaN(start1) || isNaN(end1) || isNaN(start2) || isNaN(end2)) {
    console.error("Error: One of the time conversions resulted in NaN.");
    return false;
  }

  return start1 < end2 && start2 < end1;
}

async function hasTimeConflict(student, newSessions) {
  const studentCourses = await Course.find({ code: { $in: student.registeredCourses } });

  for (const existingCourse of studentCourses) {
    console.log(`Checking conflicts with course: ${existingCourse.code}`);

    for (const existingSession of existingCourse.lectureSessions) {
      for (const newSession of newSessions) {
        if (isTimeConflict(existingSession, newSession)) {
          console.log(`Conflict detected with lecture of ${existingCourse.code}`);
          return { conflict: true, message: `Time conflict with an existing lecture in ${existingCourse.code}.` };
        }
      }
    }

    for (const existingSection of existingCourse.sections) {
      if (existingSection.registeredStudents.includes(student.id)) {
        for (const existingSession of existingSection.sessions) {
          for (const newSession of newSessions) {
            if (isTimeConflict(existingSession, newSession)) {
              console.log(`Conflict detected with section of ${existingCourse.code}`);
              return { conflict: true, message: `Time conflict with an existing section in ${existingCourse.code}.` };
            }
          }
        }
      }
    }
  }

  return { conflict: false };
}
const getCurrentTerm = () => {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 8 ? `Fall ${year}` : `Spring ${year}`;
};

// Course registration handler
async function registerForCourses(req, res) {
  const { courseCodes } = req.body;
  const studentId = req.user.id;
  const session = await mongoose.startSession();
  
  let transactionInProgress = true;
  try {
    session.startTransaction();
    const currentTerm = getCurrentTerm();
    const codesToRegister = Array.isArray(courseCodes) ? courseCodes : [courseCodes];
    
    // Validate input
    if (codesToRegister.length === 0) {
      await session.abortTransaction();
      transactionInProgress = false;
      return res.status(400).json({ message: 'No course codes provided' });
    }

    const student = await User.findOne({ id: studentId, role: 'student' }).session(session);
    if (!student) {
      await session.abortTransaction();
      transactionInProgress = false;
      return res.status(404).json({ message: 'Student not found' });
    }

    // Initialize performance if not exists
    student.performance = student.performance || {
      cgpa: 0,
      termGpa: 0,
      passedCourses: [],
      failedCourses: [],
      totalCreditHoursCompleted: 0,
      remainingCreditHours: 140,
      academicLevel: 'First',
      maxAllowedCreditHours: 18,
      termStatus: 'active'
    };

    const courses = await Course.find({ code: { $in: codesToRegister } }).session(session);
    
    // Validate all courses exist
    const foundCourseCodes = courses.map(c => c.code);
    const missingCourses = codesToRegister.filter(code => !foundCourseCodes.includes(code));
    if (missingCourses.length > 0) {
      await session.abortTransaction();
      transactionInProgress = false;
      return res.status(404).json({ 
        message: `Courses not found: ${missingCourses.join(', ')}`,
        missingCourses
      });
    }

    // Check if already registered
    const alreadyRegistered = codesToRegister.filter(code => 
      student.registeredCourses.includes(code)
    );
    if (alreadyRegistered.length > 0) {
      await session.abortTransaction();
      transactionInProgress = false;
      return res.status(400).json({ 
        message: `Already registered for: ${alreadyRegistered.join(', ')}`,
        alreadyRegistered
      });
    }

    // Check if already passed (unless retaking a failed course)
    const passedCourseCodes = student.performance?.passedCourses?.map(c => c.code) || [];
    const failedCourseCodes = student.performance?.failedCourses?.map(c => c.code) || [];
    
    const invalidCourses = [];
    const retakeCourses = [];
    
    codesToRegister.forEach(code => {
      if (passedCourseCodes.includes(code) && !failedCourseCodes.includes(code)) {
        invalidCourses.push(code);
      } else if (failedCourseCodes.includes(code)) {
        retakeCourses.push(code);
      }
    });

    if (invalidCourses.length > 0) {
      await session.abortTransaction();
      transactionInProgress = false;
      return res.status(400).json({ 
        message: `Cannot register for passed courses: ${invalidCourses.join(', ')}`,
        invalidCourses
      });
    }

    // For retake courses, get previous attempt info
    const retakeDetails = retakeCourses.map(code => {
      const failedAttempts = student.performance.failedCourses
        .filter(fc => fc.code === code)
        .map(fc => ({
          term: fc.term,
          grade: fc.grade,
          attemptNumber: fc.attemptNumber
        }));
      
      return {
        courseCode: code,
        previousAttempts: failedAttempts,
        nextAttemptNumber: Math.max(...failedAttempts.map(a => a.attemptNumber), 0) + 1
      };
    });

    // Check prerequisites (only for non-failed courses)
    const prerequisiteErrors = [];
    
    courses.forEach(course => {
      if (!failedCourseCodes.includes(course.code)) {
        const prerequisites = course.prerequisites || [];
        const missingPrereqs = prerequisites.filter(prereq => 
          !passedCourseCodes.includes(prereq)
        );
        if (missingPrereqs.length > 0) {
          prerequisiteErrors.push({
            courseCode: course.code,
            missingPrerequisites: missingPrereqs
          });
        }
      }
    });
    
    if (prerequisiteErrors.length > 0) {
      await session.abortTransaction();
      transactionInProgress = false;
      return res.status(400).json({ 
        message: 'Missing prerequisites for some courses',
        prerequisiteErrors
      });
    }

    // Check course capacity
    const fullCourses = courses.filter(course => 
      course.capacity && course.registeredStudents.length >= course.capacity
    ).map(c => c.code);
    
    if (fullCourses.length > 0) {
      await session.abortTransaction();
      transactionInProgress = false;
      return res.status(400).json({ 
        message: `Courses are full: ${fullCourses.join(', ')}`,
        fullCourses
      });
    }

    // Calculate total credit hours after registration
    const currentHours = student.currentTermCourses.reduce(
      (sum, course) => sum + (course.creditHours || 0), 0
    );
    const newHours = courses.reduce(
      (sum, course) => sum + (course.creditHours || 0), 0
    );
    const totalHoursAfterRegistration = currentHours + newHours;

    // Check max allowed credit hours
    if (totalHoursAfterRegistration > student.performance.maxAllowedCreditHours) {
      await session.abortTransaction();
      transactionInProgress = false;
      return res.status(400).json({ 
        message: `Exceeds maximum allowed credit hours (${student.performance.maxAllowedCreditHours})`,
        currentHours,
        attemptedAdditionalHours: newHours,
        maxAllowed: student.performance.maxAllowedCreditHours
      });
    }

    // Check for time conflicts with all new courses
    for (const course of courses) {
      const conflictCheck = await hasTimeConflict(student, course.lectureSessions);
      if (conflictCheck.conflict) {
        await session.abortTransaction();
        transactionInProgress = false;
        return res.status(400).json({ 
          message: conflictCheck.message,
          conflictingCourse: course.code
        });
      }
    }

    // Update student records
    student.registeredCourses = [...new Set([...student.registeredCourses, ...codesToRegister])];
    
    student.currentTermCourses = [
      ...student.currentTermCourses,
      ...codesToRegister
        .filter(code => !student.currentTermCourses.some(c => c.code === code))
        .map(code => {
          const course = courses.find(c => c.code === code);
          return {
            code,
            name: course.name,
            creditHours: course.creditHours
          };
        })
    ];

    // Remove from failed courses if retaking
    student.performance.failedCourses = student.performance.failedCourses.filter(
      fc => !codesToRegister.includes(fc.code)
    );

    // Update course registrations
    await Promise.all(
      courses.map(course => {
        if (!course.registeredStudents.includes(studentId)) {
          course.registeredStudents.push(studentId);
        }
        return course.save({ session });
      })
    );

    await student.save({ session });
    await session.commitTransaction();
    transactionInProgress = false;

    return res.status(200).json({ 
      message: 'Successfully registered for courses',
      registeredCourses: codesToRegister,
      term: currentTerm,
      totalCreditHours: totalHoursAfterRegistration,
      retakeDetails: retakeDetails.length > 0 ? retakeDetails : undefined
    });

  } catch (error) {
    if (transactionInProgress) {
      await session.abortTransaction();
    }
    console.error('Registration failed:', error);
    return res.status(500).json({ 
      message: 'Registration failed',
      error: error.message 
    });
  } finally {
    session.endSession();
  }
}

// RegisterForSections function
async function registerForSections(req, res) {
  const { registrations } = req.body;
  const studentId = req.user.id;
  const session = await mongoose.startSession();

  try {
    session.startTransaction();
    const registrationRequests = Array.isArray(registrations) ? registrations : [registrations];

    if (registrationRequests.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'No registration requests provided' });
    }

    const student = await User.findOne({ id: studentId, role: 'student' }).session(session);
    if (!student) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Student not found.' });
    }

    const courseCodes = [...new Set(registrationRequests.map(r => r.courseCode))];
    const courses = await Course.find({ code: { $in: courseCodes } }).session(session);

    const sectionsPerCourse = {};
    registrationRequests.forEach(request => {
      if (!sectionsPerCourse[request.courseCode]) {
        sectionsPerCourse[request.courseCode] = [];
      }
      sectionsPerCourse[request.courseCode].push(request.sectionId);
    });

    const multipleSectionsCourses = Object.entries(sectionsPerCourse)
      .filter(([_, sections]) => sections.length > 1)
      .map(([courseCode]) => courseCode);

    if (multipleSectionsCourses.length > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        message: 'Cannot register for multiple sections of the same course',
        coursesWithMultipleSections: multipleSectionsCourses
      });
    }

    const alreadyRegisteredSections = [];
    registrationRequests.forEach(request => {
      const course = courses.find(c => c.code === request.courseCode);
      if (course) {
        const registeredInCourse = course.sections.some(section => 
          section.registeredStudents.includes(studentId)
        );
        if (registeredInCourse) {
          alreadyRegisteredSections.push({
            courseCode: request.courseCode,
            existingSection: course.sections.find(s => 
              s.registeredStudents.includes(studentId)
            )?.sectionId
          });
        }
      }
    });

    if (alreadyRegisteredSections.length > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        message: 'Already registered in a section for some courses',
        alreadyRegisteredSections
      });
    }

    if (registrationRequests.length === 1) {
      const { courseCode, sectionId } = registrationRequests[0];
      
      const course = courses.find(c => c.code === courseCode);
      if (!course) {
        await session.abortTransaction();
        return res.status(404).json({ message: `Course ${courseCode} not found` });
      }

      if (!student.registeredCourses.includes(courseCode)) {
        await session.abortTransaction();
        return res.status(400).json({ message: `Not registered for course ${courseCode}` });
      }

      const section = course.sections.find(sec => sec.sectionId === sectionId);
      if (!section) {
        await session.abortTransaction();
        return res.status(404).json({ message: `Section ${sectionId} not found` });
      }

      if (section.capacity && section.registeredStudents.length >= section.capacity) {
        await session.abortTransaction();
        return res.status(400).json({ message: `Section ${sectionId} is full` });
      }

      const timeConflict = await hasTimeConflict(student, section.sessions);
      if (timeConflict.conflict) {
        const studentCourses = await Course.find({ code: { $in: student.registeredCourses } }).session(session);
        let conflictingItem = null;

        for (const existingCourse of studentCourses) {
          for (const lectureSession of existingCourse.lectureSessions) {
            for (const newSession of section.sessions) {
              if (isTimeConflict(lectureSession, newSession)) {
                conflictingItem = {
                  type: 'lecture',
                  courseCode: existingCourse.code,
                  day: lectureSession.day,
                  time: `${lectureSession.startTime}-${lectureSession.endTime}`
                };
                break;
              }
            }
            if (conflictingItem) break;
          }
          if (conflictingItem) break;

          for (const existingSection of existingCourse.sections) {
            if (existingSection.registeredStudents.includes(studentId)) {
              for (const existingSession of existingSection.sessions) {
                for (const newSession of section.sessions) {
                  if (isTimeConflict(existingSession, newSession)) {
                    conflictingItem = {
                      type: 'section',
                      courseCode: existingCourse.code,
                      sectionId: existingSection.sectionId,
                      day: existingSession.day,
                      time: `${existingSession.startTime}-${existingSession.endTime}`
                    };
                    break;
                  }
                }
                if (conflictingItem) break;
              }
            }
            if (conflictingItem) break;
          }
          if (conflictingItem) break;
        }

        await session.abortTransaction();
        return res.status(400).json({
          message: 'Time conflict detected',
          conflictDetails: {
            requestedSection: {
              courseCode,
              sectionId,
              sessions: section.sessions.map(s => ({
                day: s.day,
                time: `${s.startTime}-${s.endTime}`
              }))
            },
            conflictingWith: conflictingItem || { type: 'unknown' },
            suggestion: 'Please choose a different section or adjust your schedule'
          }
        });
      }

      section.registeredStudents.push(studentId);
      student.registeredSections.push(sectionId);

      await Promise.all([
        course.save({ session }),
        student.save({ session })
      ]);

      await session.commitTransaction();
      return res.status(200).json({
        message: 'Successfully registered for section',
        registeredSection: { courseCode, sectionId }
      });
    }

    const validation = {
      missingCourses: [],
      notRegisteredCourses: [],
      missingSections: [],
      fullSections: [],
      timeConflicts: []
    };

    for (const request of registrationRequests) {
      const { courseCode, sectionId } = request;
      
      const course = courses.find(c => c.code === courseCode);
      if (!course) {
        validation.missingCourses.push(courseCode);
        continue;
      }

      if (!student.registeredCourses.includes(courseCode)) {
        validation.notRegisteredCourses.push(courseCode);
        continue;
      }

      const section = course.sections.find(sec => sec.sectionId === sectionId);
      if (!section) {
        validation.missingSections.push({ courseCode, sectionId });
        continue;
      }

      if (section.capacity && section.registeredStudents.length >= section.capacity) {
        validation.fullSections.push({ courseCode, sectionId });
        continue;
      }

      const timeConflict = await hasTimeConflict(student, section.sessions);
      if (timeConflict.conflict) {
        validation.timeConflicts.push({
          courseCode,
          sectionId,
          message: timeConflict.message
        });
      }
    }

    const hasErrors = Object.values(validation).some(arr => arr.length > 0);
    if (hasErrors) {
      await session.abortTransaction();
      return res.status(400).json({
        message: 'Registration validation failed',
        ...validation
      });
    }

    const successfulRegistrations = [];
    for (const request of registrationRequests) {
      const { courseCode, sectionId } = request;
      const course = courses.find(c => c.code === courseCode);
      const section = course.sections.find(sec => sec.sectionId === sectionId);

      if (!section.registeredStudents.includes(studentId)) {
        section.registeredStudents.push(studentId);
      }

      if (!student.registeredSections.includes(sectionId)) {
        student.registeredSections.push(sectionId);
      }

      successfulRegistrations.push({ courseCode, sectionId });
    }

    await Promise.all([
      ...courses.map(course => course.save({ session })),
      student.save({ session })
    ]);

    await session.commitTransaction();

    return res.status(200).json({
      message: 'Successfully registered for all sections',
      registeredSections: successfulRegistrations
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Error during section registration:', error);
    return res.status(500).json({
      message: 'An error occurred while processing your registration',
      error: error.message
    });
  } finally {
    session.endSession();
  }
}

async function dropCourse(req, res) {
  const { courseCode } = req.body;
  const studentId = req.user.id;

  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const student = await User.findOne({ id: studentId, role: 'student' }).session(session);
    if (!student) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Student not found.' });
    }

    const course = await Course.findOne({ code: courseCode }).session(session);
    if (!course) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Course not found.' });
    }

    // Check if student has already passed this course
    const passedCourses = student.performance?.passedCourses?.map(c => c.code) || [];
    if (passedCourses.includes(courseCode)) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Cannot drop a course you have already passed.' 
      });
    }

    // Check if student is currently registered for this course
    if (!student.registeredCourses.includes(courseCode)) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Not currently registered for this course.' 
      });
    }

    // Check if the course has been graded (in current term)
    const currentTerm = getCurrentTerm();
    const isGraded = student.performance?.failedCourses?.some(
      fc => fc.code === courseCode && fc.term === currentTerm
    );

    if (isGraded) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Cannot drop a course that has already been graded for this term.' 
      });
    }

    // Get all section IDs from the course that the student is registered in
    const sectionsToDrop = course.sections
      .filter(section => section.registeredStudents.includes(studentId))
      .map(section => section.sectionId);

    // Remove from registered sections
    student.registeredSections = student.registeredSections.filter(
      sectionId => !sectionsToDrop.includes(sectionId)
    );

    // Remove student from all sections in the course
    course.sections.forEach(section => {
      section.registeredStudents = section.registeredStudents.filter(
        id => id !== studentId
      );
    });

    // Remove from registered courses
    student.registeredCourses = student.registeredCourses.filter(
      code => code !== courseCode
    );

    // Remove from current term courses
    student.currentTermCourses = student.currentTermCourses.filter(
      course => course.code !== courseCode
    );

    // Remove from course's registered students
    course.registeredStudents = course.registeredStudents.filter(
      id => id !== studentId
    );

    await Promise.all([
      student.save({ session }),
      course.save({ session })
    ]);

    await session.commitTransaction();

    return res.status(200).json({
      message: `Successfully dropped course ${courseCode} and all associated sections.`,
      droppedSections: sectionsToDrop
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error dropping course:', error);
    return res.status(500).json({ 
      message: 'An error occurred while processing your request.',
      error: error.message 
    });
  } finally {
    session.endSession();
  }
}

async function dropSection(req, res) {
  const { courseCode, sectionId } = req.body;
  const studentId = req.user.id;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const student = await User.findOne({ id: studentId, role: 'student' }).session(session);
    if (!student) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Student not found.' });
    }

    const course = await Course.findOne({ code: courseCode }).session(session);
    if (!course) {
      await session.abortTransaction();
      return res.status(404).json({ message: `Course with code "${courseCode}" not found.` });
    }

    const section = course.sections.find(sec => sec.sectionId === sectionId);
    if (!section) {
      await session.abortTransaction();
      return res.status(404).json({ message: `Section with ID "${sectionId}" not found.` });
    }

    // Check if student has already passed this course
    const passedCourses = student.performance?.passedCourses?.map(c => c.code) || [];
    if (passedCourses.includes(courseCode)) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Cannot drop a section for a course you have already passed.' 
      });
    }

    // Check if student is registered for this course
    if (!student.registeredCourses.includes(courseCode)) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Not registered for this course.' 
      });
    }

    // Check if the course has been graded (in current term)
    const currentTerm = getCurrentTerm();
    const isGraded = student.performance?.failedCourses?.some(
      fc => fc.code === courseCode && fc.term === currentTerm
    );

    if (isGraded) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Cannot drop a section for a course that has already been graded this term.' 
      });
    }

    // Check if student is registered in this section
    const isRegisteredInSection = section.registeredStudents.includes(studentId);
    const isTrackedInStudentProfile = student.registeredSections?.includes(sectionId);

    if (!isRegisteredInSection && !isTrackedInStudentProfile) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'You are not registered for this section.' 
      });
    }

    // Perform the drop operation
    if (isTrackedInStudentProfile) {
      student.registeredSections = student.registeredSections.filter(id => id !== sectionId);
    }

    if (isRegisteredInSection) {
      section.registeredStudents = section.registeredStudents.filter(id => id !== studentId);
    }

    await Promise.all([
      student.save({ session }),
      course.save({ session })
    ]);

    await session.commitTransaction();

    return res.status(200).json({ 
      message: `Successfully dropped section ${sectionId} in course ${courseCode}.` 
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Error dropping section:', error);
    return res.status(500).json({ 
      message: 'An error occurred while processing your request.',
      error: error.message 
    });
  } finally {
    session.endSession();
  }
}

async function getAvailableCourses(req, res) {
  const studentId = req.user.id;

  try {
    const student = await User.findOne({ id: studentId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    // Get passed, failed, and registered courses
    const passedCourseCodes = student.performance?.passedCourses?.map(c => c.code) || [];
    const failedCourseCodes = student.performance?.failedCourses?.map(c => c.code) || [];
    const registeredCourses = student.registeredCourses || [];

    // Find all courses that:
    // 1. Either failed or meets prerequisites
    const allCourses = await Course.find({
      $or: [
        { code: { $in: failedCourseCodes } }, // Include failed courses
        { 
          code: { $nin: passedCourseCodes }, // Exclude passed courses
          prerequisites: { 
            $not: { $elemMatch: { $nin: passedCourseCodes } }
          }
        }
      ]
    });

    // Format course data with additional info
    const formattedCourses = await Promise.all(
      allCourses.map(async (course) => {
        const isFailedCourse = failedCourseCodes.includes(course.code);
        const isRegistered = registeredCourses.includes(course.code);
        const doctor = await User.findOne({ id: course.doctorId, role: 'doctor' });
        
        const sectionsWithTANames = await Promise.all(
          course.sections.map(async (section) => {
            let teachingAssistantName = 'No TA assigned';
            if (section.taId) {
              const ta = await User.findOne({ id: section.taId, role: 'ta' });
              if (ta) teachingAssistantName = ta.name;
            }
            return {
              sectionId: section.sectionId,
              sessions: section.sessions,
              teachingAssistant: teachingAssistantName,
              capacity: section.capacity,
              registeredStudents: section.registeredStudents.length,
            };
          })
        );

        return {
          code: course.code,
          name: course.name,
          lectureSessions: course.lectureSessions,
          doctorName: doctor ? doctor.name : 'No doctor assigned',
          sections: sectionsWithTANames,
          isFailedCourse,
          isRegistered, // Add this flag to indicate registration status
          creditHours: course.creditHours,
          prerequisites: course.prerequisites || []
        };
      })
    );

    return res.status(200).json({
      message: 'Available courses fetched successfully.',
      courses: formattedCourses,
      failedCourses: failedCourseCodes,
      registeredCourses: registeredCourses // Also include the list of registered courses
    });
  } catch (error) {
    console.error('Error fetching available courses:', error);
    return res.status(500).json({ 
      message: 'An error occurred while fetching available courses.',
      error: error.message
    });
  }
}

async function getCourseSections(req, res) {
  const { courseCode } = req.params;
  const studentId = req.user.id;

  try {
    const student = await User.findOne({ id: studentId, role: 'student' });
    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    if (!student.registeredCourses.includes(courseCode)) {
      return res.status(400).json({ message: 'You are not registered for this course.' });
    }

    const course = await Course.findOne({ code: courseCode });
    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    const doctor = await User.findOne({ id: course.doctorId, role: 'doctor' });
    const doctorName = doctor ? doctor.name : 'No doctor assigned';

    const sectionsWithTANames = await Promise.all(
      course.sections.map(async (section) => {
        let teachingAssistantName = 'No TA assigned';
        if (section.taId) {
          const ta = await User.findOne({ id: section.taId, role: 'ta' });
          if (ta) {
            teachingAssistantName = ta.name;
          }
        }
        return {
          sectionId: section.sectionId,
          sessions: section.sessions,
          teachingAssistant: teachingAssistantName,
          capacity: section.capacity,
          registeredStudents: section.registeredStudents.length,
        };
      })
    );

    return res.status(200).json({
      message: 'Course sections fetched successfully.',
      sections: sectionsWithTANames,
      course: {
        code: course.code,
        name: course.name,
        lectureSessions: course.lectureSessions,
        doctorName: doctorName,
      },
    });
  } catch (error) {
    console.error('Error fetching course sections:', error);
    return res.status(500).json({ message: 'An error occurred while fetching course sections.' });
  }
}

const generateTimetable = async (req, res) => {
  const { userId } = req.params;
  const user = req.user;

  console.log('Generating timetable for user:', userId);
  console.log('User role:', user.role);

  try {
    const userDetails = await User.findOne({ id: userId });
    if (!userDetails) {
      console.log('User not found:', userId);
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.id !== userId) {
      console.log('Unauthorized access: Token user ID does not match requested user ID');
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    let timetable = {};

    switch (userDetails.role) {
      case 'student':
        console.log('Generating timetable for student:', userId);
        const studentCourses = await Course.find({ code: { $in: userDetails.registeredCourses } });
        console.log('Student courses:', studentCourses);
        timetable = await generateStudentTimetable(studentCourses, userId);
        break;

      case 'doctor':
        console.log('Generating timetable for doctor:', userId);
        const doctorCourses = await Course.find({ doctorId: userId });
        console.log('Doctor courses:', doctorCourses);
        timetable = generateDoctorTimetable(doctorCourses);
        break;

      case 'ta':
        console.log('Generating timetable for TA:', userId);
        const taCourses = await Course.find({ 'sections.taId': userId });
        console.log('TA courses:', taCourses);
        timetable = await generateTATimetable(taCourses, userId);
        break;

      default:
        console.log('Invalid role:', userDetails.role);
        return res.status(403).json({ message: 'Access denied. Invalid role.' });
    }

    console.log('Generated timetable:', timetable);
    res.status(200).json({ message: 'Timetable generated successfully', timetable });
  } catch (err) {
    console.error('Error generating timetable:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const generateStudentTimetable = async (courses, studentId) => {
  const timetable = {};

  for (const course of courses) {
    const { lectureSessions, name, code, sections, doctorId } = course;

    const doctor = await User.findOne({ id: doctorId, role: 'doctor' });
    const doctorName = doctor ? doctor.name : 'No doctor assigned';

    if (lectureSessions && lectureSessions.length > 0) {
      for (const session of lectureSessions) {
        const sessionKey = `${session.day}-${session.startTime}-${session.endTime}-${code}`;

        if (!timetable[session.day]) {
          timetable[session.day] = [];
        }

        const isDuplicate = timetable[session.day].some(
          (entry) => entry.code === code && entry.type === 'Lecture'
        );

        if (!isDuplicate) {
          timetable[session.day].push({
            type: 'Lecture',
            name,
            code,
            room: session.room,
            startTime: session.startTime,
            endTime: session.endTime,
            doctorName: doctorName,
          });
        }
      }
    }

    for (const section of sections) {
      const { sessions, taId, registeredStudents } = section;

      if (registeredStudents.includes(studentId)) {
        for (const session of sessions) {
          const sessionKey = `${session.day}-${session.startTime}-${session.endTime}-${code}-${section.sectionId}`;

          if (!timetable[session.day]) {
            timetable[session.day] = [];
          }

          const isDuplicate = timetable[session.day].some(
            (entry) => entry.code === code && entry.type === 'Section' && entry.sectionId === section.sectionId
          );

          if (!isDuplicate) {
            let teachingAssistantName = 'No TA assigned';
            if (taId) {
              const ta = await User.findOne({ id: taId, role: 'ta' });
              if (ta) {
                teachingAssistantName = ta.name;
              }
            }

            timetable[session.day].push({
              type: 'Section',
              name,
              code,
              room: session.room,
              startTime: session.startTime,
              endTime: session.endTime,
              teachingAssistant: teachingAssistantName,
              sectionId: section.sectionId,
            });
          }
        }
      }
    }
  }

  return timetable;
};

const generateDoctorTimetable = (courses) => {
  const timetable = {};

  courses.forEach(course => {
    const { lectureSessions, name, code } = course;

    if (lectureSessions && lectureSessions.length > 0) {
      for (const session of lectureSessions) {
        if (!timetable[session.day]) {
          timetable[session.day] = [];
        }

        timetable[session.day].push({
          type: 'Lecture',
          name,
          code,
          room: session.room,
          startTime: session.startTime,
          endTime: session.endTime,
        });
      }
    }
  });

  return timetable;
};

const generateTATimetable = async (courses, taId) => {
  const timetable = {};

  for (const course of courses) {
    const { name, code, sections } = course;

    for (const section of sections) {
      const { sessions } = section;

      if (section.taId === taId) {
        for (const session of sessions) {
          if (!timetable[session.day]) {
            timetable[session.day] = [];
          }

          timetable[session.day].push({
            type: 'Section',
            name,
            code,
            room: session.room,
            startTime: session.startTime,
            endTime: session.endTime,
          });
        }
      }
    }
  }

  return timetable;
};
//  getStudentExams
const getStudentExams = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const studentId = req.user.id;
    const currentTerm = getCurrentTerm();
    const [semester, year] = currentTerm.split(' ');
    const debugInfo = {};

    // 1. Get complete student record with performance data
    const student = await User.findOne({ 
      id: studentId, 
      role: 'student' 
    })
    .select('registeredCourses performance.failedCourses performance.passedCourses')
    .session(session);

    if (!student) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false,
        message: 'Student not found',
        debug: { studentId }
      });
    }

    debugInfo.registeredCourses = student.registeredCourses;
    debugInfo.failedCourses = student.performance?.failedCourses?.map(c => c.code) || [];
    debugInfo.passedCourses = student.performance?.passedCourses?.map(c => c.code) || [];

    // 2. Check if student has any registered courses
    if (student.registeredCourses.length === 0) {
      await session.commitTransaction();
      return res.status(200).json({
        success: true,
        semester: currentTerm,
        exams: [],
        currentDate: new Date().toISOString(),
        message: 'You are not currently registered for any courses',
        debug: debugInfo
      });
    }

    // 3. Find exams for registered courses in current term
    const exams = await Exam.find({
      courseCode: { $in: student.registeredCourses },
      $or: [
        { semester: semester, academicYear: year },
        { semester: currentTerm } // Alternative format check
      ]
    })
    .sort({ examDate: 1, startTime: 1 })
    .session(session);

    debugInfo.foundExamsCount = exams.length;
    debugInfo.examQueryDetails = {
      query: {
        courseCode: { $in: student.registeredCourses },
        $or: [
          { semester: semester, academicYear: year },
          { semester: currentTerm }
        ]
      },
      matchedCourses: exams.map(e => e.courseCode)
    };

    // 4. If no exams found, investigate why
    if (exams.length === 0) {
      // Check if exams exist for these courses in other terms
      const otherTermExams = await Exam.aggregate([
        { $match: { courseCode: { $in: student.registeredCourses } }},
        { $group: { 
          _id: null,
          terms: { $addToSet: { semester: "$semester", year: "$academicYear" }},
          examTypes: { $addToSet: "$examType" }
        }}
      ]).session(session);

      debugInfo.otherTermsData = otherTermExams[0] || null;

      // Check if courses actually exist
      const coursesExist = await Course.find({
        code: { $in: student.registeredCourses }
      })
      .select('code name')
      .session(session);

      debugInfo.coursesExist = coursesExist.map(c => c.code);
      debugInfo.coursesNotFound = student.registeredCourses.filter(
        code => !coursesExist.some(c => c.code === code)
      );

      await session.commitTransaction();
      
      return res.status(200).json({
        success: true,
        semester: currentTerm,
        exams: [],
        currentDate: new Date().toISOString(),
        message: 'No exams found for your registered courses this term',
        debug: debugInfo,
        suggestions: [
          'Verify exams have been scheduled for these courses',
          'Check if the semester/year in exam records matches current term',
          'Confirm your course registration is active'
        ]
      });
    }

    // 5. Get course details and format response
    const courseDetails = await Course.find(
      { code: { $in: [...new Set(exams.map(e => e.courseCode))] }},
      'code name'
    ).session(session);

    const courseMap = courseDetails.reduce((map, course) => {
      map[course.code] = course.name;
      return map;
    }, {});

    const currentDate = new Date();
    const formattedExams = exams.map(exam => {
      const room = exam.rooms.find(r => 
        r.students.some(s => s.studentId === studentId)
      );
      
      const examDate = new Date(exam.examDate);
      
      return {
        examId: exam.examId,
        courseCode: exam.courseCode,
        courseName: courseMap[exam.courseCode] || exam.courseName,
        examType: exam.examType,
        date: exam.examDate,
        day: examDate.toLocaleDateString('en-US', { weekday: 'long' }),
        time: `${exam.startTime} - ${exam.endTime}`,
        duration: exam.duration,
        location: room ? room.roomNumber : 'Not assigned',
        status: examDate > currentDate ? 'Upcoming' : 'Completed',
        hasConflict: false
      };
    });

    // Check for scheduling conflicts
    formattedExams.forEach((exam, i) => {
      formattedExams.slice(i + 1).forEach(otherExam => {
        if (exam.date === otherExam.date) {
          const [start1, end1] = exam.time.split(' - ').map(t => new Date(`${exam.date} ${t}`));
          const [start2, end2] = otherExam.time.split(' - ').map(t => new Date(`${otherExam.date} ${t}`));
          
          if (start1 < end2 && start2 < end1) {
            exam.hasConflict = true;
            otherExam.hasConflict = true;
          }
        }
      });
    });

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      semester: currentTerm,
      exams: formattedExams,
      currentDate: currentDate.toISOString(),
      message: `Found ${formattedExams.length} exams`,
      stats: {
        upcoming: formattedExams.filter(e => e.status === 'Upcoming').length,
        completed: formattedExams.filter(e => e.status === 'Completed').length,
        conflicts: formattedExams.filter(e => e.hasConflict).length
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Exam fetch error:', {
      error: error.message,
      stack: error.stack,
      studentId: req.user.id,
      timestamp: new Date()
    });
    
    res.status(500).json({ 
      success: false,
      message: 'Failed to retrieve exam information',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      requestId: req.id
    });
  } finally {
    session.endSession();
  }
};

module.exports = {
  registerForCourses,
  registerForSections,
  dropCourse,       
  dropSection,
  getAvailableCourses,
  getCourseSections,
  generateTimetable,
  getStudentExams
};