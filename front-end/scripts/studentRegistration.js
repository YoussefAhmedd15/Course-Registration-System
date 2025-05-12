// Base API URL
const baseUrl = 'http://localhost:8000/api/v1';

// Get user data from token
const token = localStorage.getItem('token');
if (!token) {
  window.location.href = 'Login.html';
  throw new Error('No access token found');
}

// Cache for course data
const courseCache = {
  timestamp: null,
  data: null,
  // Cache TTL in minutes (reduced from 5 to 1 minute)
  TTL: 1
};

// Registration status information
let registrationStatus = {
  registration_allowed: false,
  withdrawal_allowed: false,
  message: '',
  registration_message: '',
  withdrawal_message: ''
};

// Global variable to store currently selected time slots
let selectedTimeSlots = {
  lecture: null,
  lab: null,
  tutorial: null
};

// Global variable to store current course ID for time slot selection
let currentCourseId = null;

// Mock time slots data for testing
const MOCK_TIME_SLOTS = {
  lecture: [
    { time_slot_id: "L1", day_of_week: "Monday", start_time: "09:00 AM", end_time: "10:30 AM", instructor_name: "Dr. Smith", room_id: "A101" },
    { time_slot_id: "L2", day_of_week: "Wednesday", start_time: "09:00 AM", end_time: "10:30 AM", instructor_name: "Dr. Smith", room_id: "A101" },
    { time_slot_id: "L3", day_of_week: "Friday", start_time: "11:00 AM", end_time: "12:30 PM", instructor_name: "Dr. Johnson", room_id: "B202" }
  ],
  lab: [
    { time_slot_id: "LAB1", day_of_week: "Tuesday", start_time: "01:00 PM", end_time: "03:00 PM", instructor_name: "TA Williams", room_id: "LAB301" },
    { time_slot_id: "LAB2", day_of_week: "Thursday", start_time: "01:00 PM", end_time: "03:00 PM", instructor_name: "TA Davis", room_id: "LAB302" }
  ],
  tutorial: [
    { time_slot_id: "TUT1", day_of_week: "Tuesday", start_time: "04:00 PM", end_time: "05:00 PM", instructor_name: "TA Roberts", room_id: "C105" },
    { time_slot_id: "TUT2", day_of_week: "Thursday", start_time: "04:00 PM", end_time: "05:00 PM", instructor_name: "TA Roberts", room_id: "C105" }
  ]
};

// Parse the JWT token to get user info
function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1]
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/")
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    )
    return JSON.parse(jsonPayload)
  } catch (e) {
    console.error("Error parsing JWT token:", e)
    return {}
  }
}

// Get user data from token
const userData = parseJwt(token)
let studentId = localStorage.getItem('userId') || userData.user_id;

// Log user data to debug
console.log('User data from token:', {
  id: studentId,
  role: userData.role,
  name: userData.name
});

// Performance monitoring
const performanceMetrics = {
  startTime: null,
  endTime: null,
  apiCalls: {},
  
  startTimer: function(name) {
    this.apiCalls[name] = { startTime: performance.now() };
    if (!this.startTime) this.startTime = performance.now();
  },
  
  endTimer: function(name) {
    if (this.apiCalls[name]) {
      this.apiCalls[name].endTime = performance.now();
      this.apiCalls[name].duration = this.apiCalls[name].endTime - this.apiCalls[name].startTime;
      console.log(`📊 ${name} took ${this.apiCalls[name].duration.toFixed(2)}ms`);
    }
  },
  
  finishLoading: function() {
    this.endTime = performance.now();
    const totalTime = this.endTime - this.startTime;
    console.log(`🚀 Total loading time: ${totalTime.toFixed(2)}ms`);
  }
};

// Elements to update
const totalCoursesElement = document.querySelector(".info-card:nth-child(1) .number")
const creditHoursElement = document.querySelector(".info-card:nth-child(2) .number")
const gpaElement = document.querySelector(".info-card:nth-child(3) .number")
const courseGrid = document.querySelector(".course-grid")
const searchInput = document.querySelector(".search-bar input")
const filterTabs = document.querySelectorAll(".filter-tabs .tab")

// Store courses for filtering
let allCourses = []
let registeredCourses = []
let availableCourses = []
let currentFilter = "all"

// Fetch student information
async function fetchStudentInfo() {
  performanceMetrics.startTimer('fetchStudentInfo');
  try {
    console.log('Fetching student info with ID:', studentId);
    
    // The backend expects student_id, instructor_id, or admin_id
    // Let's try to fetch the user by ID which should work for both formats
    let response = await fetch(`${baseUrl}/users/${studentId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
    })

    console.log('Student info response status:', response.status);
    
    // If the first attempt fails and the ID is numeric, try with "student_" prefix
    if (!response.ok && !isNaN(studentId) && response.status === 404) {
      console.log('First attempt failed. Trying with student_ prefix...');
      const prefixedId = `student_${studentId}`;
      
      response = await fetch(`${baseUrl}/users/${prefixedId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      });
      
      console.log('Second attempt response status:', response.status);
      
      // If the second attempt succeeds, update the studentId for future requests
      if (response.ok) {
        studentId = prefixedId;
        console.log('Updated studentId to:', studentId);
      }
    }
    
    if (!response.ok) {
      if (response.status === 401) {
        // Token expired or invalid
        clearAuthStorage()
        window.location.href = "Login.html"
        return
      }
      
      // Try to get error details from response
      const errorText = await response.text();
      console.error("Student info error response:", errorText);
      
      throw new Error("Failed to fetch student information")
    }

    const student = await response.json()
    console.log('Student data received:', student);

    // Update credit hours and GPA on the page with null checks
    if (creditHoursElement) {
      creditHoursElement.textContent = student.credit_hours || 0
    }
    if (gpaElement) {
      gpaElement.textContent = student.GPA || "N/A"
    }

    performanceMetrics.endTimer('fetchStudentInfo');
    return student
  } catch (error) {
    performanceMetrics.endTimer('fetchStudentInfo');
    console.error("Error fetching student information:", error)
    displayErrorMessage("Failed to load student information")
  }
}

// Fetch student enrollments
async function fetchEnrollments() {
  performanceMetrics.startTimer('fetchEnrollments');
  try {
    console.log('Fetching enrollments for student:', studentId);
    console.log('Using baseUrl:', baseUrl);
    console.log('Using token:', token ? 'Token exists' : 'No token');
    
    const response = await fetch(`${baseUrl}/enrollments/student/${studentId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
    })

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      if (response.status === 401) {
        console.log('Authentication failed - redirecting to login');
        clearAuthStorage()
        window.location.href = "Login.html"
        return
      }
      const errorData = await response.json().catch(() => ({}));
      console.error('Error response:', errorData);
      throw new Error(errorData.detail || `Failed to fetch enrollments: ${response.status}`)
    }

    const enrollments = await response.json()
    console.log('Received enrollments:', enrollments);
    
    registeredCourses = enrollments.filter(
      (enrollment) => enrollment.status === "Pending" || enrollment.status === "Completed",
    )

    // Update total courses on the page with null check
    if (totalCoursesElement) {
      totalCoursesElement.textContent = registeredCourses.length
    }

    performanceMetrics.endTimer('fetchEnrollments');
    return enrollments
  } catch (error) {
    performanceMetrics.endTimer('fetchEnrollments');
    console.error("Error fetching enrollments:", error)
    console.error("Error stack:", error.stack)
    displayErrorMessage(error.message || "Failed to load enrollment information")
    return []
  }
}

// Fetch available courses
async function fetchAvailableCourses(forceRefresh = false) {
  performanceMetrics.startTimer('fetchAvailableCourses');
  try {
    console.log("Fetching available courses...")
    
    // Check if cached data is available and valid (unless force refresh)
    const now = Date.now();
    if (!forceRefresh && courseCache.data && courseCache.timestamp && 
        ((now - courseCache.timestamp) / 60000) < courseCache.TTL) {
      console.log("🔄 Using cached course data");
      availableCourses = courseCache.data;
      processCourses();
      performanceMetrics.endTimer('fetchAvailableCourses');
      return courseCache.data;
    }
    
    // Show loading indicator in the course grid while fetching
    if (courseGrid) {
      courseGrid.innerHTML = '<div class="loading-indicator">Loading courses...</div>';
    }
    
    const response = await fetch(`${baseUrl}/courses/tree/available`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
    })

    console.log("Available courses response status:", response.status);
    
    if (!response.ok) {
      if (response.status === 401) {
        console.log("Authentication failed - redirecting to login");
        clearAuthStorage()
        window.location.href = "Login.html"
        return []
      }
      
      // Try to get error details from response
      const errorText = await response.text();
      console.error("Error response text:", errorText);
      
      let errorDetail;
      try {
        errorDetail = JSON.parse(errorText).detail;
      } catch (e) {
        errorDetail = `Failed to fetch available courses: ${response.status}`;
      }
      
      throw new Error(errorDetail || `Failed to fetch available courses: ${response.status}`);
    }

    const data = await response.json()
    console.log("Available courses data received:", data ? "Data received" : "No data")

    // The API returns an array of departments, each with courses
    // We need to extract all courses from all departments
    let extractedCourses = processCoursesFromDepartments(data);

    console.log("Extracted courses count:", extractedCourses.length)

    // Store all extracted courses
    availableCourses = extractedCourses
    
    // Cache the course data
    courseCache.data = extractedCourses;
    courseCache.timestamp = Date.now();
    console.log("💾 Course data cached");

    // Process and merge courses
    processCourses()

    performanceMetrics.endTimer('fetchAvailableCourses');
    return extractedCourses
  } catch (error) {
    performanceMetrics.endTimer('fetchAvailableCourses');
    console.error("Error fetching available courses:", error)
    console.error("Error stack:", error.stack)
    
    // Clear loading indicator if error occurs
    if (courseGrid) {
      courseGrid.innerHTML = '<div class="error-message">Failed to load courses. Please try again.</div>';
    }
    
    // Only display a non-intrusive error message for this (don't use alert)
    console.error("Failed to load available courses:", error.message);
    return []
  }
}

// Extract courses from departments data - moved out to a separate function for clarity
function processCoursesFromDepartments(data) {
  let extractedCourses = [];
  
  if (Array.isArray(data)) {
    // Process department structure
    data.forEach((department) => {
      if (department.courses && Array.isArray(department.courses)) {
        // Add department info to each course
        const departmentCourses = department.courses.map((course) => ({
          ...course,
          department_name: department.department_name,
        }))
        extractedCourses = extractedCourses.concat(departmentCourses)

        // Also extract courses from children
        departmentCourses.forEach((course) => {
          if (course.children && Array.isArray(course.children)) {
            const flattenedChildren = flattenCourseTree(course.children, department.department_name)
            extractedCourses = extractedCourses.concat(flattenedChildren)
          }
        })
      }
    })
  } else {
    console.warn("Available courses data is not an array:", data);
  }
  
  return extractedCourses;
}

// Process and merge courses from both sources
function processCourses() {
  // Create a map of registered courses by course_id for quick lookup
  const registeredCoursesMap = new Map()
  registeredCourses.forEach((course) => {
    registeredCoursesMap.set(course.course_id, course)
  })

  // Process all available courses and mark if they're registered
  allCourses = availableCourses.map((course) => {
    const isRegistered = registeredCoursesMap.has(course.course_id)
    const registeredCourse = registeredCoursesMap.get(course.course_id)

    return {
      ...course,
      isRegistered,
      status: isRegistered ? registeredCourse.status : null,
      course_name: course.name || (registeredCourse ? registeredCourse.course_name : null),
    }
  })

  // Add any registered courses that might not be in the available courses list
  registeredCourses.forEach((course) => {
    if (!allCourses.some((c) => c.course_id === course.course_id)) {
      allCourses.push({
        ...course,
        name: course.course_name,
        isRegistered: true,
      })
    }
  })

  console.log("Processed courses:", allCourses)
}

// Helper function to flatten the course tree
function flattenCourseTree(courses, departmentName) {
  let flattenedCourses = []

  courses.forEach((course) => {
    // Add the course with department info
    flattenedCourses.push({
      ...course,
      department_name: departmentName,
    })

    // Recursively add children
    if (course.children && Array.isArray(course.children)) {
      const children = flattenCourseTree(course.children, departmentName)
      flattenedCourses = flattenedCourses.concat(children)
    }
  })

  return flattenedCourses
}

// Fetch registration status from server
async function fetchRegistrationStatus() {
  performanceMetrics.startTimer('fetchRegistrationStatus');
  try {
    const response = await fetch(`${baseUrl}/semester/registration/status`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
    });
    
    if (response.ok) {
      const status = await response.json();
      console.log('Registration status:', status);
      
      // Update global registration status
      registrationStatus = {
        registration_allowed: status.registration_allowed || false,
        withdrawal_allowed: status.withdrawal_allowed || false,
        message: status.message || '',
        registration_message: !status.registration_allowed ? 
          (status.message || "Course registration is currently closed by the administrator.") : '',
        withdrawal_message: !status.withdrawal_allowed ? 
          (status.message || "Course withdrawal is currently closed by the administrator.") : ''
      };
      
      // Show registration status notification if needed
      updateRegistrationStatusNotification();
    }
    
    performanceMetrics.endTimer('fetchRegistrationStatus');
    return registrationStatus;
  } catch (error) {
    performanceMetrics.endTimer('fetchRegistrationStatus');
    console.error("Error fetching registration status:", error);
    return registrationStatus;
  }
}

// Update the UI to show registration status notification
function updateRegistrationStatusNotification() {
  // Remove any existing notifications
  const existingNotification = document.querySelector('.registration-status-notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  // Create notification if registration or withdrawal is disabled
  if (!registrationStatus.registration_allowed || !registrationStatus.withdrawal_allowed) {
    const notification = document.createElement('div');
    notification.className = 'registration-status-notification';
    
    let notificationContent = '<div class="notification-header">Notice</div><div class="notification-content">';
    
    if (!registrationStatus.registration_allowed) {
      notificationContent += `
        <div class="status-item">
          <span class="status-icon">🔒</span>
          <span class="status-text">Course Registration: <span class="status-disabled">Disabled</span></span>
          <p>${registrationStatus.registration_message}</p>
        </div>`;
    }
    
    if (!registrationStatus.withdrawal_allowed) {
      notificationContent += `
        <div class="status-item">
          <span class="status-icon">🔒</span>
          <span class="status-text">Course Withdrawal: <span class="status-disabled">Disabled</span></span>
          <p>${registrationStatus.withdrawal_message}</p>
        </div>`;
    }
    
    notificationContent += '</div>';
    notification.innerHTML = notificationContent;
    
    // Insert at the top of the course grid
    if (courseGrid) {
      courseGrid.insertAdjacentElement('beforebegin', notification);
      
      // Add CSS for the notification
      const style = document.createElement('style');
      style.textContent = `
        .registration-status-notification {
          background-color: #fff3cd;
          border: 1px solid #ffecb5;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        .notification-header {
          font-weight: bold;
          margin-bottom: 10px;
          color: #856404;
        }
        .status-item {
          margin-bottom: 8px;
          display: flex;
          flex-direction: column;
        }
        .status-icon {
          margin-right: 8px;
        }
        .status-text {
          font-weight: 500;
        }
        .status-disabled {
          color: #dc3545;
        }
        .status-item p {
          margin-top: 3px;
          margin-bottom: 0;
          font-size: 0.9em;
          color: #666;
        }
        .status-message {
          background-color: #f8d7da;
          border: 1px solid #f5c6cb;
          border-radius: 4px;
          color: #721c24;
          padding: 8px 12px;
          margin: 10px 0;
          font-size: 0.9em;
        }
        button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
      `;
      document.head.appendChild(style);
    }
  }
}

// Create a course card element
function createCourseCard(course) {
  const isRegistered = course.isRegistered
  const isRegisteredTab = currentFilter === "registered"

  const courseCard = document.createElement("div")
  courseCard.className = "course-card"
  courseCard.dataset.courseId = course.course_id

  // Check if course has prerequisites
  const hasPrerequisites = course.prerequisites && course.prerequisites.length > 0
  const prerequisitesText = hasPrerequisites
    ? `<div class="prerequisites">Prerequisites: ${course.prerequisites.join(", ")}</div>`
    : ""

  // Check if course is offered in current semester
  const semesterText =
    course.semesters && course.semesters.length > 0
      ? `<div class="semesters">Offered in: ${course.semesters.join(", ")}</div>`
      : '<div class="semesters">Offered in: All Semesters</div>'

  // Determine button text and class based on registration status and current tab
  let buttonClass = isRegistered ? "drop-btn" : "register-btn"
  let buttonText = isRegistered ? "Drop Course" : "Register"
  let buttonDisabled = ''
  let statusMsg = ''

  // Check if registration or withdrawal is disabled
  if (!isRegistered && !registrationStatus.registration_allowed) {
    buttonDisabled = 'disabled'
    statusMsg = `<div class="status-message">Registration Disabled: ${registrationStatus.registration_message}</div>`
  } else if (isRegistered && !registrationStatus.withdrawal_allowed && !isRegisteredTab) {
    buttonDisabled = 'disabled'
    statusMsg = `<div class="status-message">Withdrawal Disabled: ${registrationStatus.withdrawal_message}</div>`
  }

  // If we're in the registered tab, show "Choose Time Slot" instead
  if (isRegistered && isRegisteredTab) {
    buttonClass = "time-slot-btn"
    buttonText = "Choose Time Slot"
    buttonDisabled = '' // Enable time slot selection regardless of withdrawal status
    statusMsg = '' // No status message for time slot selection
  }

  courseCard.innerHTML = `
        <h2>${course.course_name || course.name}</h2>
        <p class="instructor">${course.instructor_name || "Instructor information unavailable"}</p>
        <div class="course-details">
            <div class="detail">
                <span>Course Code:</span>
                <span>${course.course_id}</span>
            </div>
            <div class="detail">
                <span>Credit Hours:</span>
                <span>${course.credit_hours}</span>
            </div>
            <div class="detail">
                <span>${isRegistered ? "Status:" : "Department:"}</span>
                <span>${isRegistered ? course.status : course.department_name || "Unknown"}</span>
            </div>
        </div>
        ${prerequisitesText}
        ${semesterText}
        ${statusMsg}
        <button class="${buttonClass}" ${buttonDisabled}>${buttonText}</button>
    `

  // Add event listeners to the buttons
  const button = courseCard.querySelector("button")

  if (!button.disabled) {
    if (isRegistered && isRegisteredTab) {
      // Time slot button for registered courses in the registered tab
      button.addEventListener("click", () => openTimeSlotModal(course.course_id))
    } else if (isRegistered) {
      // Drop button for registered courses in other tabs
      button.addEventListener("click", () => handleDropCourse(course.course_id))
    } else {
      // Register button for available courses
      button.addEventListener("click", () => handleRegisterCourse(course.course_id))
    }
  }

  return courseCard
}

// Function to clear course cache and reload courses
function clearCourseCache() {
  courseCache.data = null;
  courseCache.timestamp = null;
  console.log("Course cache cleared");
  
  // Show loading indicator
  if (courseGrid) {
    courseGrid.innerHTML = '<div class="loading-indicator">Refreshing courses...</div>';
  }
  
  // Reload courses data with force refresh
  fetchAvailableCourses(true).then(() => {
    displayCourses(currentFilter);
  });
}

// Display courses based on filter
function displayCourses(filter = "all") {
  courseGrid.innerHTML = ""
  
  // Add refresh button above the course grid
  const refreshButton = document.createElement("button");
  refreshButton.className = "refresh-courses-btn";
  refreshButton.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Refresh Courses';
  refreshButton.addEventListener("click", clearCourseCache);
  courseGrid.appendChild(refreshButton);
  
  // Add a style for the refresh button if not already present
  if (!document.getElementById('refresh-button-style')) {
    const style = document.createElement('style');
    style.id = 'refresh-button-style';
    style.textContent = `
      .refresh-courses-btn {
        background-color: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        padding: 8px 12px;
        margin-bottom: 15px;
        cursor: pointer;
        display: flex;
        align-items: center;
        font-size: 14px;
        color: #495057;
        transition: all 0.2s;
      }
      .refresh-courses-btn:hover {
        background-color: #e9ecef;
      }
      .refresh-courses-btn i {
        margin-right: 5px;
      }
    `;
    document.head.appendChild(style);
  }
  
  let coursesToDisplay = []

  switch (filter) {
    case "registered":
      coursesToDisplay = allCourses.filter((course) => course.isRegistered)
      break
    case "available":
      coursesToDisplay = allCourses.filter((course) => !course.isRegistered)
      break
    default: // 'all'
      coursesToDisplay = allCourses
  }

  // Apply search filter if search is active
  const searchTerm = searchInput.value.toLowerCase().trim()
  if (searchTerm) {
    coursesToDisplay = coursesToDisplay.filter(
      (course) =>
        (course.course_name || course.name).toLowerCase().includes(searchTerm) ||
        course.course_id.toLowerCase().includes(searchTerm),
    )
  }

  if (coursesToDisplay.length === 0) {
    const emptyMessage = document.createElement("div")
    emptyMessage.className = "empty-message"
    emptyMessage.textContent = "No courses found"
    courseGrid.appendChild(emptyMessage)
  } else {
    coursesToDisplay.forEach((course) => {
      courseGrid.appendChild(createCourseCard(course))
    })
  }
}

// Handle course registration
async function handleRegisterCourse(courseId) {
  try {
    // First check if registration is allowed
    try {
      const statusResponse = await fetch(`${baseUrl}/semester/registration/status`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      });
      
      if (statusResponse.ok) {
        const status = await statusResponse.json();
        // Update the global registration status
        const previousRegistrationAllowed = registrationStatus.registration_allowed;
        
        registrationStatus.registration_allowed = status.registration_allowed || false;
        registrationStatus.registration_message = !status.registration_allowed ? 
          (status.message || "Course registration is currently closed.") : '';
          
        // If registration status changed, update the UI
        if (previousRegistrationAllowed !== registrationStatus.registration_allowed) {
          updateRegistrationStatusNotification();
          // Re-display courses to update UI
          displayCourses(currentFilter);
        }
          
        if (!status.registration_allowed) {
          if (window.Swal) {
            Swal.fire({
              title: 'Registration Closed',
              text: status.message || "Course registration is currently closed.",
              icon: 'warning',
              confirmButtonText: 'OK'
            });
          } else {
            alert(status.message || "Course registration is currently closed.");
          }
          return;
        }
      }
    } catch (statusError) {
      console.error("Error checking registration status:", statusError);
    }
    
    // Show loading indicator
    let loadingAlert;
    if (window.Swal) {
      loadingAlert = Swal.fire({
        title: 'Registering...',
        text: 'Processing your course registration',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });
    }
    
    const response = await fetch(`${baseUrl}/enrollments/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        student_id: studentId,
        course_id: courseId,
      }),
    })
    
    // Close loading indicator if using SweetAlert2
    if (loadingAlert) {
      loadingAlert.close();
    }

    if (!response.ok) {
      const errorData = await response.json()
      const errorMessage = errorData.detail || "Failed to register for course";
      
      if (window.Swal) {
        Swal.fire({
          title: 'Registration Failed',
          text: errorMessage,
          icon: 'error',
          confirmButtonText: 'OK'
        });
      } else {
        alert(`Registration failed: ${errorMessage}`);
      }
      
      throw new Error(errorMessage);
    }

    const result = await response.json()

    // Show success message
    if (window.Swal) {
      Swal.fire({
        title: 'Success!',
        text: `Successfully registered for ${result.course_name}`,
        icon: 'success',
        confirmButtonText: 'OK'
      });
    } else {
      alert(`Successfully registered for ${result.course_name}`);
    }

    // Update the course in our local data instead of refreshing everything
    updateCourseRegistrationStatus(courseId, true, result)

    // Refresh the display with the current filter
    displayCourses(currentFilter)
  } catch (error) {
    console.error("Error registering for course:", error);
    if (!window.Swal) {
      alert(`Registration failed: ${error.message}`);
    }
  }
}

// Handle dropping a course
async function handleDropCourse(courseId) {
  try {
    // First check if withdrawal is allowed
    try {
      const statusResponse = await fetch(`${baseUrl}/semester/registration/status`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      });
      
      if (statusResponse.ok) {
        const status = await statusResponse.json();
        // Update the global registration status
        const previousWithdrawalAllowed = registrationStatus.withdrawal_allowed;
        
        registrationStatus.withdrawal_allowed = status.withdrawal_allowed || false;
        registrationStatus.withdrawal_message = !status.withdrawal_allowed ? 
          (status.message || "Course withdrawal is currently closed.") : '';
        
        // If withdrawal status changed, update the UI
        if (previousWithdrawalAllowed !== registrationStatus.withdrawal_allowed) {
          updateRegistrationStatusNotification();
          // Re-display courses to update UI
          displayCourses(currentFilter);
        }
          
        if (!status.withdrawal_allowed) {
          if (window.Swal) {
            Swal.fire({
              title: 'Withdrawal Closed',
              text: status.message || "Course withdrawal is currently closed.",
              icon: 'warning',
              confirmButtonText: 'OK'
            });
          } else {
            alert(status.message || "Course withdrawal is currently closed.");
          }
          return;
        }
      }
    } catch (statusError) {
      console.error("Error checking withdrawal status:", statusError);
    }
    
    // Ask for confirmation
    let shouldProceed = false;
    
    if (window.Swal) {
      const result = await Swal.fire({
        title: 'Confirm Course Drop',
        text: 'Are you sure you want to drop this course?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, drop it',
        cancelButtonText: 'Cancel'
      });
      
      shouldProceed = result.isConfirmed;
    } else {
      shouldProceed = confirm("Are you sure you want to drop this course?");
    }
    
    if (!shouldProceed) {
      return;
    }
    
    // Show loading indicator
    let loadingAlert;
    if (window.Swal) {
      loadingAlert = Swal.fire({
        title: 'Processing...',
        text: 'Dropping course',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });
    }

    const response = await fetch(`${baseUrl}/enrollments/${courseId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    
    // Close loading indicator if using SweetAlert2
    if (loadingAlert) {
      loadingAlert.close();
    }

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.detail || "Failed to drop course";
      
      if (window.Swal) {
        Swal.fire({
          title: 'Error',
          text: errorMessage,
          icon: 'error',
          confirmButtonText: 'OK'
        });
      } else {
        alert(`Failed to drop course: ${errorMessage}`);
      }
      
      throw new Error(errorMessage);
    }

    const result = await response.json();

    // Show success message
    if (window.Swal) {
      Swal.fire({
        title: 'Success!',
        text: result.message || 'Course dropped successfully',
        icon: 'success',
        confirmButtonText: 'OK'
      });
    } else {
      alert(result.message);
    }

    // Update the course in our local data instead of refreshing everything
    updateCourseRegistrationStatus(courseId, false);

    // Refresh the display with the current filter
    displayCourses(currentFilter);
  } catch (error) {
    console.error("Error dropping course:", error);
    if (!window.Swal) {
      alert(`Failed to drop course: ${error.message}`);
    }
  }
}

// Update course registration status in local data
function updateCourseRegistrationStatus(courseId, isRegistered, courseData = null) {
  // Find the course in our allCourses array
  const courseIndex = allCourses.findIndex((course) => course.course_id === courseId)

  if (courseIndex !== -1) {
    // Update the course registration status
    allCourses[courseIndex].isRegistered = isRegistered

    if (isRegistered && courseData) {
      // Update with data from the registration response
      allCourses[courseIndex].status = courseData.status
      allCourses[courseIndex].course_name = courseData.course_name

      // Add to registered courses
      registeredCourses.push({
        ...courseData,
        isRegistered: true,
      })

      // Update total courses count
      totalCoursesElement.textContent = registeredCourses.length
    } else if (!isRegistered) {
      // Remove from registered courses
      registeredCourses = registeredCourses.filter((course) => course.course_id !== courseId)

      // Update total courses count
      totalCoursesElement.textContent = registeredCourses.length
    }
  }
}

// Show error message to user
function displayErrorMessage(message) {
  console.error(message);
  // Only show alert if message exists
  if (message) {
    if (typeof showError === 'function') {
      showError(message);
    } else if (window.Swal) {
      Swal.fire({
        title: 'Error',
        text: message,
        icon: 'error',
        confirmButtonText: 'OK'
      });
    } else {
      alert(message);
    }
  }
}

// Event listeners for tab buttons
filterTabs.forEach((tab) => {
  tab.addEventListener("click", function () {
    filterTabs.forEach((t) => t.classList.remove("active"))
    this.classList.add("active")

    const filter = this.textContent.toLowerCase()
    currentFilter = filter
    displayCourses(filter)
  })
})

// Event listener for search input
searchInput.addEventListener("input", () => {
  displayCourses(currentFilter)
})

// Time slot modal handling
async function openTimeSlotModal(courseId) {
  try {
    currentCourseId = courseId;
    const modal = document.getElementById("timeSlotModal");
    document.getElementById("courseCodeDisplay").textContent = courseId;
    
    // Reset selected time slots
    selectedTimeSlots = {
      lecture: null,
      lab: null,
      tutorial: null
    };
    
    // Add CSS styles for time slots if not already present
    if (!document.getElementById('time-slot-styles')) {
      const style = document.createElement('style');
      style.id = 'time-slot-styles';
      style.textContent = `
        .time-slots-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 15px;
          margin-top: 15px;
        }
        
        .time-slot-card {
          border: 1px solid #dee2e6;
          border-radius: 8px;
          padding: 15px;
          cursor: pointer;
          transition: all 0.2s;
          background-color: #f8f9fa;
        }
        
        .time-slot-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          border-color: #adb5bd;
        }
        
        .time-slot-card.selected {
          background-color: #e3f2fd;
          border-color: #2196f3;
          box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.3);
        }
        
        .time-slot-day {
          font-weight: bold;
          margin-bottom: 5px;
          color: #495057;
        }
        
        .time-slot-time {
          font-size: 0.9em;
          margin-bottom: 8px;
          color: #212529;
        }
        
        .time-slot-instructor, .time-slot-room {
          font-size: 0.8em;
          color: #6c757d;
        }
        
        .no-slots-message {
          padding: 20px;
          text-align: center;
          color: #6c757d;
          font-style: italic;
        }
        
        .error-message {
          padding: 20px;
          text-align: center;
          color: #dc3545;
        }
        
        .loading-indicator {
          padding: 20px;
          text-align: center;
          color: #6c757d;
        }
        
        .tab-btn {
          background-color: #f8f9fa;
          border: 1px solid #dee2e6;
          padding: 8px 15px;
          cursor: pointer;
          border-radius: 4px 4px 0 0;
          margin-right: 5px;
        }
        
        .tab-btn.active {
          background-color: #fff;
          border-bottom-color: #fff;
          font-weight: bold;
        }
        
        .tab-content {
          border: 1px solid #dee2e6;
          border-radius: 0 4px 4px 4px;
          padding: 15px;
          min-height: 200px;
          max-height: 400px;
          overflow-y: auto;
        }
        
        .tab-pane {
          display: none;
        }
        
        .tab-pane.active {
          display: block;
        }
        
        .btn-submit {
          background-color: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 10px 15px;
          cursor: pointer;
          font-weight: 500;
          margin-top: 15px;
        }
        
        .btn-submit:hover {
          background-color: #0069d9;
        }
      `;
      document.head.appendChild(style);
    }
    
    // Show loading indicators in all tabs
    document.getElementById("lecture").innerHTML = '<div class="loading-indicator">Loading lecture time slots...</div>';
    document.getElementById("lab").innerHTML = '<div class="loading-indicator">Loading lab time slots...</div>';
    document.getElementById("tutorial").innerHTML = '<div class="loading-indicator">Loading tutorial time slots...</div>';
    
    // Fetch available time slots
    await fetchAvailableTimeSlots(courseId);
    
    // Setup tab navigation
    setupTabNavigation();
    
    // Show the modal
    modal.style.display = "block";
  } catch (error) {
    console.error("Error opening time slot modal:", error);
    alert("Failed to load time slots. Please try again.");
  }
}

// Fetch existing time slot selections for the student and course
async function fetchExistingTimeSlots(courseId) {
  try {
    // Get schedule data from the student's overall schedule - this endpoint exists in the backend
    const response = await fetch(`${baseUrl}/schedule/${studentId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
    });
    
    if (!response.ok) {
      // It's okay if there's no schedule yet
      console.log(`No existing schedule found for student ${studentId}, status: ${response.status}`);
      return;
    }
    
    const scheduleData = await response.json();
    console.log("Full schedule data:", scheduleData);
    
    // Find the course we're looking for in the schedule
    const courseSchedule = scheduleData.schedule?.find(item => item.course_id === courseId);
    
    if (courseSchedule && courseSchedule.slots && courseSchedule.slots.length > 0) {
      console.log("Found existing schedule for course:", courseSchedule);
      
      // Reset selected time slots before setting new ones
      selectedTimeSlots = {
        lecture: null,
        lab: null,
        tutorial: null
      };
      
      // Process each slot by its type
      courseSchedule.slots.forEach(slot => {
        if (slot.type === 'Lecture') {
          selectedTimeSlots.lecture = slot.slot_id;
          highlightSelectedTimeSlot("lecture", slot.slot_id);
        } else if (slot.type === 'Lab') {
          selectedTimeSlots.lab = slot.slot_id;
          highlightSelectedTimeSlot("lab", slot.slot_id);
        } else if (slot.type === 'Tutorial') {
          selectedTimeSlots.tutorial = slot.slot_id;
          highlightSelectedTimeSlot("tutorial", slot.slot_id);
        }
      });
    } else {
      console.log("No existing schedule found for this course");
    }
  } catch (error) {
    console.error("Error fetching existing time slots:", error);
    // Non-critical error, we can continue without existing selections
  }
}

// Fetch available time slots from the server
async function fetchAvailableTimeSlots(courseId) {
  try {
    console.log(`Fetching time slots for course: ${courseId}`);
    // Show loading indicators in all tabs
    document.getElementById("lecture").innerHTML = '<div class="loading-indicator">Loading lecture time slots...</div>';
    document.getElementById("lab").innerHTML = '<div class="loading-indicator">Loading lab time slots...</div>';
    document.getElementById("tutorial").innerHTML = '<div class="loading-indicator">Loading tutorial time slots...</div>';
    
    // Get time slots from the API - use the AdminTimeSlots endpoint which works
    const response = await fetch(`${baseUrl}/time-slots/course/${courseId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
    });
    
    console.log(`Time slots API response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to fetch time slots: ${response.status}`);
      console.error(`Error response: ${errorText}`);
      
      document.getElementById("lecture").innerHTML = '<div class="error-message">No lecture slots available</div>';
      document.getElementById("lab").innerHTML = '<div class="error-message">No lab slots available</div>';
      document.getElementById("tutorial").innerHTML = '<div class="error-message">No tutorial slots available</div>';
      
      throw new Error(`API returned ${response.status}: ${errorText}`);
    }
    
    const timeSlots = await response.json();
    console.log("Time slots data from API:", timeSlots);
    
    // Group time slots by type
    const groupedSlots = {
      lecture: [],
      lab: [],
      tutorial: []
    };
    
    // Process the API response to group by type
    timeSlots.forEach(slot => {
      // Check for available seats - we don't have this directly, but we can query the course
      // Just add all slots for now, we'll show them all and disable selection if no seats available
      // We'll check seat availability at selection time
      if (slot.type === 'Lecture') {
        groupedSlots.lecture.push({
          time_slot_id: slot.slot_id,
          day_of_week: slot.day,
          start_time: slot.start_time,
          end_time: slot.end_time,
          instructor_name: slot.instructor_name || 'Not Assigned',
          room_id: slot.room_id
        });
      } else if (slot.type === 'Lab') {
        groupedSlots.lab.push({
          time_slot_id: slot.slot_id,
          day_of_week: slot.day,
          start_time: slot.start_time,
          end_time: slot.end_time,
          instructor_name: slot.instructor_name || 'Not Assigned',
          room_id: slot.room_id
        });
      } else if (slot.type === 'Tutorial') {
        groupedSlots.tutorial.push({
          time_slot_id: slot.slot_id,
          day_of_week: slot.day,
          start_time: slot.start_time,
          end_time: slot.end_time,
          instructor_name: slot.instructor_name || 'Not Assigned',
          room_id: slot.room_id
        });
      }
    });
    
    // Display time slots in their respective tabs
    displayTimeSlots("lecture", groupedSlots.lecture);
    displayTimeSlots("lab", groupedSlots.lab);
    displayTimeSlots("tutorial", groupedSlots.tutorial);
    
    // Check if student already has selected time slots for this course
    await fetchExistingTimeSlots(courseId);
    
  } catch (error) {
    console.error("Error fetching time slots:", error);
    document.getElementById("lecture").innerHTML = '<div class="error-message">Failed to load time slots</div>';
    document.getElementById("lab").innerHTML = '<div class="error-message">Failed to load time slots</div>';
    document.getElementById("tutorial").innerHTML = '<div class="error-message">Failed to load time slots</div>';
  }
}

// Display time slots in the specified tab
function displayTimeSlots(tabId, timeSlots) {
  const tabElement = document.getElementById(tabId);
  
  if (!timeSlots || timeSlots.length === 0) {
    tabElement.innerHTML = '<div class="no-slots-message">No time slots available</div>';
    return;
  }
  
  let html = '<div class="time-slots-grid">';
  
  timeSlots.forEach(slot => {
    html += `
      <div class="time-slot-card" data-slot-id="${slot.time_slot_id}">
        <div class="time-slot-info">
          <div class="time-slot-day">${slot.day_of_week}</div>
          <div class="time-slot-time">${slot.start_time} - ${slot.end_time}</div>
          <div class="time-slot-instructor">${slot.instructor_name || 'TBD'}</div>
          <div class="time-slot-room">${slot.room_id || 'TBD'}</div>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  tabElement.innerHTML = html;
  
  // Add click event listeners to time slot cards
  tabElement.querySelectorAll('.time-slot-card').forEach(card => {
    card.addEventListener('click', () => {
      selectTimeSlot(tabId, card.dataset.slotId);
    });
  });
}

// Handle time slot selection
function selectTimeSlot(tabId, slotId) {
  // Update selected time slot for this tab
  selectedTimeSlots[tabId] = slotId;
  
  // Update visual selection
  highlightSelectedTimeSlot(tabId, slotId);
}

// Highlight selected time slot in the UI
function highlightSelectedTimeSlot(tabId, slotId) {
  const tabElement = document.getElementById(tabId);
  
  // Remove highlight from all cards in this tab
  tabElement.querySelectorAll('.time-slot-card').forEach(card => {
    card.classList.remove('selected');
  });
  
  // Add highlight to selected card
  const selectedCard = tabElement.querySelector(`.time-slot-card[data-slot-id="${slotId}"]`);
  if (selectedCard) {
    selectedCard.classList.add('selected');
  }
}

// Setup tab navigation in time slot modal
function setupTabNavigation() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  
  // Initialize first tab as active if not already
  if (!document.querySelector('.tab-btn.active')) {
    tabButtons[0]?.classList.add('active');
    tabPanes[0]?.classList.add('active');
  }
  
  tabButtons.forEach((button, index) => {
    // Add click handler
    button.addEventListener('click', () => {
      activateTab(button.dataset.tab);
    });
    
    // Add keyboard accessibility
    button.addEventListener('keydown', (e) => {
      // Enter or Space activates the tab
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateTab(button.dataset.tab);
      }
      
      // Arrow keys for navigation between tabs
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = (index + 1) % tabButtons.length;
        tabButtons[nextIndex].focus();
      }
      
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = (index - 1 + tabButtons.length) % tabButtons.length;
        tabButtons[prevIndex].focus();
      }
    });
    
    // Make tabs focusable
    button.setAttribute('tabindex', '0');
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', button.classList.contains('active') ? 'true' : 'false');
    button.setAttribute('aria-controls', button.dataset.tab);
  });
  
  // Add ARIA attributes to tab content
  tabPanes.forEach(pane => {
    pane.setAttribute('role', 'tabpanel');
    pane.setAttribute('aria-labelledby', 'tab-' + pane.id);
  });
  
  // Setup submit button
  const submitButton = document.querySelector('.btn-submit');
  submitButton.addEventListener('click', saveTimeSlotSelection);
  
  // Add keyboard handler for Escape key to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  });
}

// Helper function to activate a tab
function activateTab(tabId) {
  // Remove active class from all buttons and panes
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });
  
  // Add active class to clicked button and corresponding pane
  const activeButton = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  const activePane = document.getElementById(tabId);
  
  if (activeButton && activePane) {
    activeButton.classList.add('active');
    activeButton.setAttribute('aria-selected', 'true');
    activePane.classList.add('active');
    
    // If there are no time slots in this tab, ensure we show a message
    if (activePane.innerHTML.trim() === '') {
      activePane.innerHTML = '<div class="no-slots-message">No time slots available</div>';
    }
  }
}

// Save time slot selection
async function saveTimeSlotSelection() {
  try {
    // Check if at least one time slot is selected
    const hasSelection = selectedTimeSlots.lecture || selectedTimeSlots.lab || selectedTimeSlots.tutorial;
    
    if (!hasSelection) {
      if (window.Swal) {
        Swal.fire({
          title: 'Selection Required',
          text: 'Please select at least one time slot',
          icon: 'warning',
          confirmButtonText: 'OK'
        });
      } else {
        alert("Please select at least one time slot");
      }
      return;
    }
    
    // Show loading indicator
    let loadingAlert;
    if (window.Swal) {
      loadingAlert = Swal.fire({
        title: 'Saving...',
        text: 'Saving your time slot selection',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });
    }
    
    // Format selected slots into an array, filtering out null values
    const selectedSlots = [];
    if (selectedTimeSlots.lecture) selectedSlots.push(selectedTimeSlots.lecture);
    if (selectedTimeSlots.lab) selectedSlots.push(selectedTimeSlots.lab);
    if (selectedTimeSlots.tutorial) selectedSlots.push(selectedTimeSlots.tutorial);
    
    console.log("Sending time slot selection:", {
      student_id: studentId,
      course_id: currentCourseId,
      selected_slots: selectedSlots
    });
    
    // Send selection to server
    const response = await fetch(`${baseUrl}/schedule/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        student_id: studentId,
        course_id: currentCourseId,
        selected_slots: selectedSlots
      }),
    });
    
    // Close loading indicator if using SweetAlert2
    if (loadingAlert) {
      loadingAlert.close();
    }
    
    if (!response.ok) {
      let errorMessage;
      try {
        // Try to parse JSON error response
        const errorData = await response.json();
        errorMessage = errorData.detail || `Failed to save time slot selection: ${response.status}`;
      } catch (e) {
        // If response is not valid JSON, get text
        const errorText = await response.text();
        errorMessage = `Error (${response.status}): ${errorText || 'Unknown error'}`;
      }
      
      console.error("Time slot selection error:", errorMessage);
      
      if (window.Swal) {
        Swal.fire({
          title: 'Error',
          text: errorMessage,
          icon: 'error',
          confirmButtonText: 'OK'
        });
      } else {
        alert(`Error: ${errorMessage}`);
      }
      
      throw new Error(errorMessage);
    }
    
    const result = await response.json();
    console.log("Schedule saved:", result);
    
    // Show success message
    if (window.Swal) {
      Swal.fire({
        title: 'Success!',
        text: 'Time slot selection saved successfully',
        icon: 'success',
        confirmButtonText: 'OK'
      }).then(() => {
        // Close modal after success
        closeModal();
        // Refresh the page to reflect changes
        location.reload();
      });
    } else {
      alert("Time slot selection saved successfully!");
      closeModal();
      // Refresh the page to reflect changes
      location.reload();
    }
    
  } catch (error) {
    console.error("Error saving time slot selection:", error);
    if (window.Swal) {
      Swal.fire({
        title: 'Error',
        text: `Failed to save time slot selection: ${error.message}`,
        icon: 'error',
        confirmButtonText: 'OK'
      });
    } else {
      alert(`Failed to save time slot selection: ${error.message}`);
    }
  }
}

function closeModal() {
  const modal = document.getElementById("timeSlotModal");
  modal.style.display = "none";
  currentCourseId = null;
}

// Initialize the page
async function init() {
  performanceMetrics.startTimer('init');
  try {
    // Show loading indicator
    if (courseGrid) {
      courseGrid.innerHTML = '<div class="loading-indicator">Loading your courses...</div>';
    }
    
    // First try to get student info to validate the student ID
    const studentInfo = await fetchStudentInfo();
    
    // Only proceed if we have valid student info
    if (!studentInfo) {
      console.error("Could not fetch student information, cannot proceed");
      if (courseGrid) {
        courseGrid.innerHTML = '<div class="error-message">Failed to load student information. Please try logging in again.</div>';
      }
      return;
    }
    
    // Fetch registration status
    await fetchRegistrationStatus();
    
    // Now fetch enrollments using the validated student ID
    const enrollments = await fetchEnrollments();
    
    // Only fetch available courses after enrollments are processed
    if (enrollments && enrollments.length >= 0) {
      // Force fresh data on initial page load
      await fetchAvailableCourses(true);
      displayCourses("all");
    }
    
    // Set up periodic check for registration status changes
    // Check every 60 seconds (60000 ms)
    setInterval(async () => {
      const oldStatus = { 
        registration_allowed: registrationStatus.registration_allowed,
        withdrawal_allowed: registrationStatus.withdrawal_allowed
      };
      
      await fetchRegistrationStatus();
      
      // If status changed, update the course display
      if (oldStatus.registration_allowed !== registrationStatus.registration_allowed || 
          oldStatus.withdrawal_allowed !== registrationStatus.withdrawal_allowed) {
        console.log("Registration status changed, updating UI");
        displayCourses(currentFilter);
      }
    }, 60000);
    
    performanceMetrics.finishLoading();
  } catch (error) {
    performanceMetrics.endTimer('init');
    console.error("Error initializing page:", error);
    displayErrorMessage("Failed to initialize page. Please try again.");
  }
}

// Start initialization when document is ready
document.addEventListener("DOMContentLoaded", function() {
  // Initialize the application
  init();
});

// Handle window click for modal
window.onclick = (event) => {
  const modal = document.getElementById("timeSlotModal")
  if (event.target == modal) {
    modal.style.display = "none"
  }
}

// Function to clear authentication storage
function clearAuthStorage() {
  localStorage.removeItem("token");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("userRole");
  localStorage.removeItem("userId");
  localStorage.removeItem("userEmail");
  localStorage.removeItem("userName");
}

function logout() {
  localStorage.clear();
  window.location.href = "Login.html";
}

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', function(e) {
    e.preventDefault();
    logout();
  });
}

