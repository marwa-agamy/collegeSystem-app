const Grade = require('../../models/Grade');
const User = require('../../models/User');
const Course = require('../../models/Course');
const mongoose = require('mongoose');
const cron = require('node-cron');

// Term management functions
const getCurrentTerm = () => {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 8 ? `Fall ${year}` : `Spring ${year}`;
};

const getNextTerm = () => {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 8 ? `Spring ${year + 1}` : `Fall ${year}`;
};

// Grading system functions
const getLetterGrade = (score) => {
  if (score >= 90) return 'A';
  if (score >= 85) return 'A-';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 70) return 'B-';
  if (score >= 65) return 'C+';
  if (score >= 60) return 'C';
  if (score >= 55) return 'C-';
  if (score >= 50) return 'D+';
  if (score >= 45) return 'D';
  return 'F';
};

const getGradePoints = (grade) => {
  switch (grade) {
    case 'A': return 4.0;
    case 'A-': return 3.7;
    case 'B+': return 3.3;
    case 'B': return 3.0;
    case 'B-': return 2.7;
    case 'C+': return 2.3;
    case 'C': return 2.0;
    case 'C-': return 1.7;
    case 'D+': return 1.3;
    case 'D': return 1.0;
    case 'F': return 0.0;
    default: throw new Error(`Invalid grade: ${grade}`);
  }
};

// GPA calculation functions
const calculateTermGPA = (grades) => {
  let totalPoints = 0;
  let totalCredits = 0;

  grades.forEach(grade => {
    const gradePoints = getGradePoints(grade.grade);
    totalPoints += gradePoints * grade.creditHours;
    totalCredits += grade.creditHours;
  });

  return totalCredits > 0 ? totalPoints / totalCredits : 0;
};

const calculateCGPA = (passedCourses) => {
  if (!passedCourses || passedCourses.length === 0) return 0;
  
  let totalGradePoints = 0;
  let totalCreditHours = 0;

  passedCourses.forEach(course => {
    const gradePoints = getGradePoints(course.grade);
    totalGradePoints += gradePoints * course.creditHours;
    totalCreditHours += course.creditHours;
  });

  return totalCreditHours > 0 ? totalGradePoints / totalCreditHours : 0;
};

// Student status functions
const calculateAcademicLevel = (completedHours) => {
  if (completedHours >= 105) return 'Fourth';
  if (completedHours >= 70) return 'Third';
  if (completedHours >= 35) return 'Second';
  return 'First';
};

const calculateMaxAllowedCreditHours = (cgpa) => {
  if (cgpa < 2.0) return 12;
  if (cgpa >= 3.3) return 21;
  return 18;
};

// Performance update function
const updateStudentPerformance = async (studentId, session = null) => {
  const sessionOptions = session ? { session } : {};
  const currentTerm = getCurrentTerm();
  
  try {
    const student = await User.findOne({ id: studentId }).session(session);
    if (!student) throw new Error('Student not found');

    // Initialize performance object if not exists
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

    // Get current term grades
    const currentTermGrades = await Grade.find({
      studentId,
      term: currentTerm
    }).session(session);

    // Process passed and failed courses
    const currentTermPassingGrades = currentTermGrades.filter(g => g.grade !== 'F');
    const currentTermFailingGrades = currentTermGrades.filter(g => g.grade === 'F');

    // Update failed courses list (without duplicates)
    currentTermFailingGrades.forEach(grade => {
      if (!student.performance.failedCourses.some(fc => fc.code === grade.courseCode)) {
        student.performance.failedCourses.push({
          code: grade.courseCode,
          name: grade.courseName,
          creditHours: grade.creditHours,
          term: grade.term
        });
      }
    });

    // Calculate term GPA
    student.performance.termGpa = parseFloat(calculateTermGPA(currentTermPassingGrades).toFixed(2));

    // Get all passing grades across all terms
    const allPassingGrades = await Grade.find({
      studentId,
      grade: { $in: ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D'] }
    }).session(session);

    // Update passed courses list
    student.performance.passedCourses = allPassingGrades.map(grade => ({
      code: grade.courseCode,
      name: grade.courseName,
      creditHours: grade.creditHours,
      score: grade.score,
      grade: grade.grade,
      term: grade.term
    }));

    // Update academic history
    const currentTermCourses = currentTermPassingGrades.map(grade => ({
      code: grade.courseCode,
      name: grade.courseName,
      creditHours: grade.creditHours,
      score: grade.score,
      grade: grade.grade
    }));

    if (currentTermCourses.length > 0) {
      const termIndex = student.academicHistory.findIndex(t => t.term === currentTerm);
      
      if (termIndex >= 0) {
        student.academicHistory[termIndex] = {
          term: currentTerm,
          courses: [
            ...student.academicHistory[termIndex].courses,
            ...currentTermCourses
          ],
          termGPA: student.performance.termGpa,
          totalCredits: student.academicHistory[termIndex].courses
            .concat(currentTermCourses)
            .reduce((sum, c) => sum + c.creditHours, 0)
        };
      } else {
        student.academicHistory.push({
          term: currentTerm,
          courses: currentTermCourses,
          termGPA: student.performance.termGpa,
          totalCredits: currentTermCourses.reduce((sum, c) => sum + c.creditHours, 0)
        });
      }
    }

    // Update cumulative performance metrics
    student.performance.cgpa = parseFloat(calculateCGPA(allPassingGrades).toFixed(2));
    student.performance.totalCreditHoursCompleted = allPassingGrades.reduce(
      (sum, grade) => sum + grade.creditHours, 0
    );
    student.performance.remainingCreditHours = Math.max(
      0, 
      140 - student.performance.totalCreditHoursCompleted
    );
    
    // With this more robust version:
    const completedHours = allPassingGrades.reduce(
      (sum, grade) => sum + (grade.creditHours || 0), 0
    );
    
    // Enforce 0-140 range
    student.performance.totalCreditHoursCompleted = Math.max(0, Math.min(completedHours, 140));
    student.performance.remainingCreditHours = Math.max(0, 140 - student.performance.totalCreditHoursCompleted);
    student.performance.maxAllowedCreditHours = calculateMaxAllowedCreditHours(
      student.performance.cgpa
    );
    student.performance.academicLevel = calculateAcademicLevel(
      student.performance.totalCreditHoursCompleted
    );

    await student.save(sessionOptions);
    
  } catch (error) {
    console.error('Error updating performance:', error);
    throw error;
  }
};

// Automatic term processing (runs at end of each term)
cron.schedule('0 0 15 12,5 *', async () => {
  console.log('Running automatic term completion processing...');
  await processTermCompletion();
});

const processTermCompletion = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    
    const currentTerm = getCurrentTerm();
    const nextTerm = getNextTerm();

    // Get all students with current term registrations
    const students = await User.find({
      role: 'student',
      $or: [
        { 'currentTermCourses.0': { $exists: true } },
        { 'performance.failedCourses.0': { $exists: true } }
      ]
    }).session(session);

    for (const student of students) {
      // Get grades for this term
      const termGrades = await Grade.find({
        studentId: student.id,
        term: currentTerm
      }).session(session);

      // Process passed and failed courses
      const passedCourses = termGrades.filter(g => g.grade !== 'F');
      const failedCourses = termGrades.filter(g => g.grade === 'F');

      // Create academic history entry
      const termEntry = {
        term: currentTerm,
        courses: passedCourses.map(grade => ({
          code: grade.courseCode,
          name: grade.courseName,
          creditHours: grade.creditHours,
          score: grade.score,
          grade: grade.grade
        })),
        termGPA: calculateTermGPA(passedCourses),
        totalCredits: passedCourses.reduce((sum, g) => sum + g.creditHours, 0),
        status: 'completed'
      };

      // Update academic history
      const existingTermIndex = student.academicHistory.findIndex(
        t => t.term === currentTerm
      );
      
      if (existingTermIndex >= 0) {
        student.academicHistory[existingTermIndex] = termEntry;
      } else {
        student.academicHistory.push(termEntry);
      }

      // Clear current term courses (failed courses remain in failedCourses list)
      student.currentTermCourses = [];
      
      // Update term status
      student.performance.termStatus = 'completed';
      
      await student.save({ session });
    }

    await session.commitTransaction();
    
    if (res) {
      res.status(200).json({
        message: 'Term processing completed successfully',
        studentsProcessed: students.length,
        term: currentTerm
      });
    } else {
      console.log(`Term processing completed for ${students.length} students`);
    }
  } catch (error) {
    await session.abortTransaction();
    console.error('Error processing term completion:', error);
    if (res) {
      res.status(500).json({
        message: 'Failed to process term completion',
        error: error.message
      });
    }
  } finally {
    session.endSession();
  }
};

const getStudentPerformance = async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await User.findOne({ 
      id: studentId,
      role: 'student'
    }).select('id name email performance academicHistory');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (req.user.role === 'student' && req.user.id !== studentId) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    const response = {
      message: 'Academic performance retrieved successfully',
      student: {
        id: student.id,
        name: student.name,
        email: student.email
      },
      performance: {
        cgpa: student.performance?.cgpa || 0,
        termGpa: student.performance?.termGpa || 0,
        passedCourses: student.performance?.passedCourses || [],
        totalCreditHoursCompleted: student.performance?.totalCreditHoursCompleted || 0,
        remainingCreditHours: student.performance?.remainingCreditHours || 140,
        academicLevel: student.performance?.academicLevel || 'First',
        maxAllowedCreditHours: student.performance?.maxAllowedCreditHours || 18
      }
    };

    res.status(200).json(response);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

const addGrade = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const { studentId, courseCode, score } = req.body;
    const doctorId = req.user.id;

    // Validate input
    if (!studentId || !courseCode || score === undefined || score === null) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    if (typeof score !== 'number' || score < 0 || score > 100) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Invalid score range' });
    }

    // Check for existing grade in this term
    const existingGrade = await Grade.findOne({
      studentId,
      courseCode,
      term: getCurrentTerm()
    }).session(session);

    if (existingGrade) {
      await session.abortTransaction();
      return res.status(409).json({ 
        success: false,
        message: 'Grade already exists for this term',
        existingGrade
      });
    }

    // Verify course and registration
    const course = await Course.findOne({ code: courseCode }).session(session);
    if (!course || !course.registeredStudents.includes(studentId)) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false,
        message: 'Course not found or student not registered'
      });
    }

    // Get student record
    const student = await User.findOne({ id: studentId }).session(session);
    if (!student) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Initialize performance if needed
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

    // Calculate grade and status
    const gradeLetter = getLetterGrade(score);
    const currentTerm = getCurrentTerm();
    const isPassing = gradeLetter !== 'F';
    const isRetake = student.performance.failedCourses.some(fc => fc.code === courseCode);

    // Create new grade
    const newGrade = new Grade({
      studentId,
      courseCode,
      courseName: course.name,
      doctorId,
      score,
      grade: gradeLetter,
      creditHours: course.creditHours,
      term: currentTerm,
      isRetake,
      attemptNumber: isRetake ? 
        (student.performance.failedCourses.find(fc => fc.code === courseCode)?.attemptNumber || 1) + 1 : 1
    });

    await newGrade.save({ session });

    // Update performance records
    if (isPassing) {
      // Add to passed courses (replace if existed)
      student.performance.passedCourses = [
        ...student.performance.passedCourses.filter(pc => pc.code !== courseCode),
        {
          code: courseCode,
          name: course.name,
          creditHours: course.creditHours,
          score,
          grade: gradeLetter,
          term: currentTerm,
          isRetake,
          attemptNumber: newGrade.attemptNumber
        }
      ];
      
      // Remove from failed courses
      student.performance.failedCourses = student.performance.failedCourses.filter(
        fc => fc.code !== courseCode
      );
    } else {
      // Add to failed courses (update if existed)
      const existingFailedIndex = student.performance.failedCourses.findIndex(
        fc => fc.code === courseCode
      );

      if (existingFailedIndex >= 0) {
        student.performance.failedCourses[existingFailedIndex] = {
          code: courseCode,
          name: course.name,
          creditHours: course.creditHours,
          score,
          grade: gradeLetter,
          term: currentTerm,
          isRetake: true,
          attemptNumber: newGrade.attemptNumber
        };
      } else {
        student.performance.failedCourses.push({
          code: courseCode,
          name: course.name,
          creditHours: course.creditHours,
          score,
          grade: gradeLetter,
          term: currentTerm,
          isRetake: false,
          attemptNumber: 1
        });
      }
    }

    // Update academic history with complete attempt record
    const termIndex = student.academicHistory.findIndex(t => t.term === currentTerm);
    const courseEntry = {
      code: courseCode,
      name: course.name,
      creditHours: course.creditHours,
      score,
      grade: gradeLetter,
      status: isPassing ? 'passed' : 'failed',
      attemptNumber: newGrade.attemptNumber,
      isRetake
    };

    if (termIndex >= 0) {
      // Check if this course already exists in term
      const courseIndex = student.academicHistory[termIndex].courses.findIndex(
        c => c.code === courseCode
      );

      if (courseIndex >= 0) {
        // Update existing entry (shouldn't normally happen)
        student.academicHistory[termIndex].courses[courseIndex] = courseEntry;
      } else {
        // Add new attempt
        student.academicHistory[termIndex].courses.push(courseEntry);
      }
    } else {
      // Create new term entry
      student.academicHistory.push({
        term: currentTerm,
        courses: [courseEntry],
        totalCredits: isPassing ? course.creditHours : 0,
        termGPA: isPassing ? getGradePoints(gradeLetter) : 0,
        status: 'completed'
      });
    }

    // Only remove from registrations if this is the final attempt (passed)
    if (isPassing) {
      // Remove from registered courses and sections
      student.registeredCourses = student.registeredCourses.filter(
        rc => rc !== courseCode
      );

      // Remove from sections
      const sectionsToRemove = course.sections
        .filter(section => section.registeredStudents.includes(studentId))
        .map(section => section.sectionId);

      student.registeredSections = student.registeredSections.filter(
        rs => !sectionsToRemove.includes(rs)
      );

      // Update course to remove student registration
      await Course.updateOne(
        { code: courseCode },
        { 
          $pull: { 
            registeredStudents: studentId,
            'sections.$[].registeredStudents': studentId 
          } 
        },
        { session }
      );

      // Remove from current term courses
      student.currentTermCourses = student.currentTermCourses.filter(
        c => c.code !== courseCode
      );
    }

    // Save all changes
    await student.save({ session });
    await updateStudentPerformance(studentId, session);
    await updateAcademicLevel(studentId, session);

    await session.commitTransaction();

    return res.status(201).json({
      success: true,
      message: 'Grade added successfully',
      grade: newGrade,
      academicHistory: {
        status: isPassing ? 'passed' : 'failed',
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Grade creation failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add grade',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    await session.endSession();
  }
};

const updateGrade = async (req, res) => {
  const { studentId, courseCode } = req.params;
  const { score } = req.body;
  const doctorId = req.user.id;
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Validate input
    if (typeof score !== 'number' || score < 0 || score > 100) {
      await session.abortTransaction();
      return res.status(400).json({ 
        success: false,
        message: 'Score must be a number between 0 and 100' 
      });
    }

    // Find the existing grade
    const grade = await Grade.findOne({ 
      studentId, 
      courseCode,
      term: getCurrentTerm()
    }).session(session);
    
    if (!grade) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false,
        message: 'Grade not found for current term' 
      });
    }

    // Verify course exists
    const course = await Course.findOne({ code: courseCode }).session(session);
    if (!course) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false,
        message: 'Course not found' 
      });
    }

    // Calculate new grade
    const newGradeLetter = getLetterGrade(score);
    const wasPassing = grade.grade !== 'F';
    const isNowPassing = newGradeLetter !== 'F';

    // Update grade record
    grade.score = score;
    grade.grade = newGradeLetter;
    grade.updatedAt = new Date();
    grade.status = 'completed';
    await grade.save({ session });

    // Get student document
    const student = await User.findOne({ id: studentId }).session(session);
    if (!student) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false,
        message: 'Student not found' 
      });
    }

    // Initialize performance if needed
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

    // Update passed courses list
    const passedCourseIndex = student.performance.passedCourses.findIndex(
      pc => pc.code === courseCode
    );

    if (passedCourseIndex >= 0) {
      // Update existing passed course entry
      student.performance.passedCourses[passedCourseIndex] = {
        code: courseCode,
        name: course.name,
        creditHours: course.creditHours,
        score: score,
        grade: newGradeLetter,
        term: grade.term,
        isRetake: grade.isRetake,
        attemptNumber: grade.attemptNumber
      };
    } else if (isNowPassing) {
      // Add to passed courses if newly passing
      student.performance.passedCourses.push({
        code: courseCode,
        name: course.name,
        creditHours: course.creditHours,
        score: score,
        grade: newGradeLetter,
        term: grade.term,
        isRetake: grade.isRetake,
        attemptNumber: grade.attemptNumber
      });
    }

    // Handle failed courses
    if (!isNowPassing) {
      // Remove from passed courses if now failing
      student.performance.passedCourses = student.performance.passedCourses.filter(
        pc => pc.code !== courseCode
      );
      
      // Add/update failed course entry with all required fields
      const existingFailedIndex = student.performance.failedCourses.findIndex(
        fc => fc.code === courseCode
      );

      const failedCourseEntry = {
        code: courseCode,
        name: course.name,
        creditHours: course.creditHours,
        score: score,
        grade: newGradeLetter,  // Include the grade
        term: grade.term,
        isRetake: grade.isRetake,
        attemptNumber: existingFailedIndex >= 0 ? 
          student.performance.failedCourses[existingFailedIndex].attemptNumber + 1 : 1
      };

      if (existingFailedIndex >= 0) {
        student.performance.failedCourses[existingFailedIndex] = failedCourseEntry;
      } else {
        student.performance.failedCourses.push(failedCourseEntry);
      }
    } else {
      // Remove from failed courses if now passing
      student.performance.failedCourses = student.performance.failedCourses.filter(
        fc => fc.code !== courseCode
      );
    }

    // Update academic history
    const termIndex = student.academicHistory.findIndex(t => t.term === grade.term);
    const courseEntry = {
      code: courseCode,
      name: course.name,
      creditHours: course.creditHours,
      score,
      grade: newGradeLetter,
      status: isNowPassing ? 'passed' : 'failed',
      attemptNumber: grade.attemptNumber,
      isRetake: grade.isRetake
    };

    if (termIndex >= 0) {
      const courseIndex = student.academicHistory[termIndex].courses.findIndex(
        c => c.code === courseCode
      );

      if (courseIndex >= 0) {
        student.academicHistory[termIndex].courses[courseIndex] = courseEntry;
      } else {
        student.academicHistory[termIndex].courses.push(courseEntry);
      }

      // Recalculate term GPA
      const termGrades = await Grade.find({
        studentId,
        term: grade.term,
        grade: { $ne: 'F' }
      }).session(session);

      student.academicHistory[termIndex].termGPA = calculateTermGPA(termGrades);
    }

    // Save all changes
    await student.save({ session });
    
    // Recalculate performance metrics
    await updateStudentPerformance(studentId, session);
    await updateAcademicLevel(studentId, session);

    await session.commitTransaction();
    
    return res.status(200).json({ 
      success: true,
      message: 'Grade updated successfully',
      grade: {
        _id: grade._id,
        studentId: grade.studentId,
        courseCode: grade.courseCode,
        courseName: grade.courseName,
        score: grade.score,
        grade: grade.grade,
        creditHours: grade.creditHours,
        term: grade.term,
        status: grade.status,
        updatedAt: grade.updatedAt
      },
      performanceUpdated: true
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Error updating grade:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Failed to update grade',
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};

const deleteGrade = async (req, res) => {
  const { studentId, courseCode } = req.params;

  try {
    const grade = await Grade.findOneAndDelete({ studentId, courseCode });
    if (!grade) {
      return res.status(404).json({ message: 'Grade not found' });
    }

    await updateStudentPerformance(studentId);

    res.status(200).json({ 
      message: 'Grade deleted successfully',
      performanceUpdated: true
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const getAllGrades = async (req, res) => {
  try {
    const grades = await Grade.find();
    res.status(200).json(grades);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const getGradeById = async (req, res) => {
  const { studentId } = req.params;

  try {
    const grades = await Grade.find({ studentId });
    if (!grades.length) {
      return res.status(404).json({ message: 'No grades found' });
    }
    res.status(200).json(grades);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const getGradesForDoctorCourse = async (req, res) => {
  const { courseCode } = req.params;
  const doctorId = req.user.id;

  try {
    const grades = await Grade.find({ courseCode, doctorId });
    res.status(200).json(grades);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const getStudentGradeInDoctorCourse = async (req, res) => {
  const { courseCode, studentId } = req.params;
  const doctorId = req.user.id;

  try {
    const grade = await Grade.findOne({ courseCode, studentId, doctorId });
    if (!grade) {
      return res.status(404).json({ message: 'Grade not found' });
    }
    res.status(200).json(grade);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

async function updateAcademicLevel(studentId, session = null) {
  try {
    const student = await User.findOne({ id: studentId }).session(session);
    if (!student) return;

    const passedCourses = student.performance.passedCourses || [];
    const completedHours = passedCourses.reduce(
      (sum, course) => sum + (course.creditHours || 0), 
      0
    );

    let newAcademicLevel;
    if (completedHours >= 105) newAcademicLevel = 'Fourth';
    else if (completedHours >= 70) newAcademicLevel = 'Third';
    else if (completedHours >= 35) newAcademicLevel = 'Second';
    else newAcademicLevel = 'First';

    if (student.academicLevel !== newAcademicLevel) {
      student.academicLevel = newAcademicLevel;
      await student.save({ session });
    }
  } catch (error) {
    console.error('Error updating academic level:', error);
    throw error;
  }
}

module.exports = {
  addGrade,
  updateGrade,
  deleteGrade,
  getAllGrades,
  getGradeById,
  getStudentPerformance,
  getGradesForDoctorCourse,
  getStudentGradeInDoctorCourse,
  updateStudentPerformance,
  updateAcademicLevel,
  processTermCompletion
};