// Get the token from localStorage
const token = localStorage.getItem("access_token")
const baseUrl = "http://127.0.0.1:8000/api/v1" // Base URL for API requests

// Check if user is logged in
if (!token) {
  window.location.href = "/front-end/html/Login.html"
}

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
const studentId = userData.user_id

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
  try {
    const response = await fetch(`${baseUrl}/users/${studentId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error("Failed to fetch student information")
    }

    const student = await response.json()

    // Update credit hours and GPA on the page
    creditHoursElement.textContent = student.credit_hours || 0
    gpaElement.textContent = student.GPA || "N/A"

    return student
  } catch (error) {
    console.error("Error fetching student information:", error)
    displayErrorMessage("Failed to load student information")
  }
}

// Fetch student enrollments
async function fetchEnrollments() {
  try {
    const response = await fetch(`${baseUrl}/enrollments/student/${studentId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error("Failed to fetch enrollments")
    }

    const enrollments = await response.json()
    registeredCourses = enrollments.filter(
      (enrollment) => enrollment.status === "Pending" || enrollment.status === "Completed",
    )

    // Update total courses on the page
    totalCoursesElement.textContent = registeredCourses.length

    return enrollments
  } catch (error) {
    console.error("Error fetching enrollments:", error)
    displayErrorMessage("Failed to load enrollment information")
    return []
  }
}

// Fetch available courses
async function fetchAvailableCourses() {
  try {
    console.log("Fetching available courses...")
    const response = await fetch(`${baseUrl}/courses/tree/available`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error("Failed to fetch available courses")
    }

    const data = await response.json()
    console.log("Available courses data:", data)

    // The API returns an array of departments, each with courses
    // We need to extract all courses from all departments
    let extractedCourses = []

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
    }

    console.log("Extracted courses:", extractedCourses)

    // Store all extracted courses
    availableCourses = extractedCourses

    // Process and merge courses
    processCourses()

    return extractedCourses
  } catch (error) {
    console.error("Error fetching available courses:", error)
    displayErrorMessage("Failed to load available courses")
    return []
  }
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

  // If we're in the registered tab, show "Choose Time Slot" instead
  if (isRegistered && isRegisteredTab) {
    buttonClass = "time-slot-btn"
    buttonText = "Choose Time Slot"
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
        <button class="${buttonClass}">${buttonText}</button>
    `

  // Add event listeners to the buttons
  const button = courseCard.querySelector("button")

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

  return courseCard
}

// Display courses based on filter
function displayCourses(filter = "all") {
  courseGrid.innerHTML = ""
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

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || "Failed to register for course")
    }

    const result = await response.json()

    // Show success message
    alert(`Successfully registered for ${result.course_name}`)

    // Update the course in our local data instead of refreshing everything
    updateCourseRegistrationStatus(courseId, true, result)

    // Refresh the display with the current filter
    displayCourses(currentFilter)
  } catch (error) {
    console.error("Error registering for course:", error)
    alert(`Registration failed: ${error.message}`)
  }
}

// Handle dropping a course
async function handleDropCourse(courseId) {
  try {
    if (!confirm("Are you sure you want to drop this course?")) {
      return
    }

    const response = await fetch(`${baseUrl}/enrollments/${courseId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || "Failed to drop course")
    }

    const result = await response.json()

    // Show success message
    alert(result.message)

    // Update the course in our local data instead of refreshing everything
    updateCourseRegistrationStatus(courseId, false)

    // Refresh the display with the current filter
    displayCourses(currentFilter)
  } catch (error) {
    console.error("Error dropping course:", error)
    alert(`Failed to drop course: ${error.message}`)
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
  alert(message)
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
function openTimeSlotModal(courseId) {
  const modal = document.getElementById("timeSlotModal")
  document.getElementById("courseCodeDisplay").textContent = courseId
  modal.style.display = "block"
}

function closeModal() {
  document.getElementById("timeSlotModal").style.display = "none"
}

// Initialize the page
async function init() {
  // Fetch all required data
  await Promise.all([fetchStudentInfo(), fetchEnrollments().then(() => fetchAvailableCourses())])

  // Display all courses initially
  displayCourses("all")
}

// Start initialization when document is ready
document.addEventListener("DOMContentLoaded", init)

// Handle window click for modal
window.onclick = (event) => {
  const modal = document.getElementById("timeSlotModal")
  if (event.target == modal) {
    modal.style.display = "none"
  }
}

