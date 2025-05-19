const API_BASE_URL = "http://127.0.0.1:8000/api/v1";

// Function to get token from local storage
async function getAuthHeaders() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '../html/Login.html';
        return {};
    }
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
}

// Function to handle API errors
async function handleApiError(error) {
    console.error('API Error:', error);
    if (error.response) {
        const data = await error.response.json();
        throw new Error(data.detail || 'An error occurred while saving the time slot');
    } else if (error.request) {
        throw new Error('No response received from server. Please check if the server is running.');
    } else {
        throw new Error('Error setting up the request: ' + error.message);
    }
}

// Check if user is logged in and is an admin
function checkAuth() {
    const token = localStorage.getItem('token');
    const userRole = localStorage.getItem('userRole');
    
    if (!token || userRole !== 'admin') {
        window.location.href = '../html/Login.html';
        return false;
    }
    return true;
}

// Function to clear authentication storage
function clearAuthStorage() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userId');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userName');
}

// Function to handle logout
function logout() {
    console.log('Logging out admin user...');
    localStorage.clear(); // Clear all localStorage items
    window.location.href = 'Login.html';
}

// Initialize page
document.addEventListener("DOMContentLoaded", function() {
    // Check authentication first
    if (!checkAuth()) {
        return;
    }

    // Load data when document is ready
    Promise.all([
        loadRooms(),
        loadInstructors(),
        loadCourses(),
        loadTimeSlots()
    ]).catch(error => {
        console.error("Error initializing page:", error);
        if (typeof showError === 'function') {
            showError("Error loading page data. Please try refreshing the page.");
        } else {
            alert("Error loading page data. Please try refreshing the page.");
        }
    });
    
    // Setup logout button event listener
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            logout();
        });
    }
});

// Load Rooms for Dropdown
async function loadRooms() {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/rooms/`, {
            headers: headers
        });
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const rooms = await response.json();
        const roomSelect = document.getElementById("roomId");
        roomSelect.innerHTML = '<option value="">Select Room</option>';

        rooms.forEach(room => {
            const option = document.createElement("option");
            option.value = room.room_id;
            option.textContent = `${room.building} - ${room.room_id}`;
            roomSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading rooms:", error);
        if (typeof showError === 'function') {
            showError("Failed to load rooms. Please try refreshing the page.");
        }
    }
}

// Load Instructors for Dropdown
async function loadInstructors() {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/users/`, {
            headers: headers
        });
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const users = await response.json();
        const instructors = users.filter(user => user.role === "instructor");
        
        const instructorSelect = document.getElementById("instructor");
        instructorSelect.innerHTML = '<option value="">Select Instructor</option>';

        instructors.forEach(instructor => {
            const option = document.createElement("option");
            option.value = instructor.instructor_id;
            option.textContent = instructor.name;
            instructorSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading instructors:", error);
    }
}

// Load Courses for Dropdown
async function loadCourses() {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/courses/`, {
            headers: headers
        });
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const courses = await response.json();
        const courseSelect = document.getElementById("courseId");
        courseSelect.innerHTML = '<option value="">Select Course</option>';

        courses.forEach(course => {
            const option = document.createElement("option");
            option.value = course.course_id;
            option.textContent = `${course.course_id} - ${course.name}`;
            courseSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading courses:", error);
    }
}

// Load Time Slots into Table
async function loadTimeSlots() {
    try {
        const headers = await getAuthHeaders();
        console.log('Fetching time slots with headers:', headers);
        
        const response = await fetch(`${API_BASE_URL}/time-slots/`, {
            headers: headers
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Server response:', response.status, errorData);
            throw new Error(errorData.detail || `HTTP error! Status: ${response.status}`);
        }

        const timeSlots = await response.json();
        console.log('Received time slots:', timeSlots);
        
        const tableBody = document.getElementById("timeSlotTableBody");
        if (!tableBody) {
            console.error('Could not find timeSlotTableBody element');
            throw new Error('Table body element not found');
        }
        
        tableBody.innerHTML = "";

        if (!Array.isArray(timeSlots)) {
            console.error('Received non-array time slots:', timeSlots);
            throw new Error('Invalid time slots data received from server');
        }

        timeSlots.forEach(slot => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${slot.room_id || 'N/A'}</td>
                <td>${slot.type || 'N/A'}</td>
                <td>${slot.start_time || 'N/A'}</td>
                <td>${slot.end_time || 'N/A'}</td>
                <td>${slot.day || 'N/A'}</td>
                <td>${slot.instructor_id || 'Not Assigned'}</td>
                <td>${slot.course_id || 'Not Assigned'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editTimeSlot('${slot.slot_id}')">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteTimeSlot('${slot.slot_id}')">Delete</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error("Error loading time slots:", error);
        if (typeof showError === 'function') {
            showError(`Failed to load time slots: ${error.message}`);
        } else {
            alert(`Failed to load time slots: ${error.message}`);
        }
    }
}

// Format time to HH:MM:SS
function formatTime(timeValue) {
    if (!timeValue) return null;
    // If time is already in HH:MM:SS format, return as is
    if (timeValue.match(/^\d{2}:\d{2}:\d{2}$/)) return timeValue;
    // If time is in HH:MM format, add seconds
    if (timeValue.match(/^\d{2}:\d{2}$/)) return `${timeValue}:00`;
    // If time is in HH format, add minutes and seconds
    if (timeValue.match(/^\d{2}$/)) return `${timeValue}:00:00`;
    return timeValue;
}

// Validate time slot data
function validateTimeSlot(formData) {
    if (!formData.room_id) {
        throw new Error('Please select a room');
    }
    if (!formData.day) {
        throw new Error('Please select a day');
    }
    if (!formData.start_time) {
        throw new Error('Please enter a start time');
    }
    if (!formData.end_time) {
        throw new Error('Please enter an end time');
    }
    if (!formData.type) {
        throw new Error('Please select a type');
    }
    if (!formData.course_id) {
        throw new Error('Please select a course - this is required for students to find the time slot');
    }

    // Validate time format
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
    if (!timeRegex.test(formData.start_time) || !timeRegex.test(formData.end_time)) {
        throw new Error('Invalid time format. Please use HH:MM:SS format');
    }

    // Validate that end time is after start time
    const start = new Date(`2000-01-01T${formData.start_time}`);
    const end = new Date(`2000-01-01T${formData.end_time}`);
    if (end <= start) {
        throw new Error('End time must be after start time');
    }
}

// Handle Form Submission for Adding/Editing Time Slots
async function saveTimeSlot(event) {
    event.preventDefault();
    
    try {
        const form = document.getElementById("timeSlotForm");
        const isEdit = form.dataset.mode === "edit";
        const slotId = form.dataset.slotId;

        const formData = {
            room_id: document.getElementById('roomId').value,
            day: document.getElementById('day').value,
            start_time: formatTime(document.getElementById('startTime').value),
            end_time: formatTime(document.getElementById('endTime').value),
            type: document.getElementById('type').value,
            instructor_id: document.getElementById('instructor').value || null,
            course_id: document.getElementById('courseId').value || null
        };

        // Validate the form data
        validateTimeSlot(formData);

        // Show loading indicator
        let loadingAlert = typeof showLoading === 'function' ? 
            showLoading(`${isEdit ? 'Updating' : 'Saving'} time slot...`) : null;

        const headers = await getAuthHeaders();
        const url = isEdit ? 
            `${API_BASE_URL}/time-slots/${slotId}` : 
            `${API_BASE_URL}/time-slots/`;
        
        const response = await fetch(url, {
            method: isEdit ? 'PUT' : 'POST',
            headers: headers,
            body: JSON.stringify(formData)
        });

        // Close loading indicator
        if (typeof closeLoading === 'function') {
            closeLoading(loadingAlert);
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `Failed to ${isEdit ? 'update' : 'save'} time slot`);
        }

        const result = await response.json();
        
        // Show success message
        if (typeof showSuccess === 'function') {
            showSuccess(`Time slot ${isEdit ? 'updated' : 'saved'} successfully!`);
        } else {
            alert(`Time slot ${isEdit ? 'updated' : 'saved'} successfully!`);
        }
        
        loadTimeSlots(); // Refresh the list
        closeModal(); // Close the modal after successful save
        
    } catch (error) {
        console.error('Error saving time slot:', error);
        if (typeof showError === 'function') {
            showError(error.message || 'An error occurred while saving the time slot');
        } else {
            alert(error.message || 'An error occurred while saving the time slot');
        }
    }
}

// Edit Time Slot
async function editTimeSlot(slotId) {
    try {
        // Show loading indicator
        let loadingAlert = typeof showLoading === 'function' ?
            showLoading('Loading time slot details...') : null;

        console.log('Fetching time slot details for ID:', slotId);
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/time-slots/${slotId}`, {
            headers: headers
        });

        // Close loading indicator
        if (typeof closeLoading === 'function') {
            closeLoading(loadingAlert);
        }

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Server response:', response.status, errorData);
            throw new Error(errorData.detail || `Failed to fetch time slot: ${response.status}`);
        }

        const slot = await response.json();
        console.log('Received time slot data:', slot);

        // Get form elements
        const roomSelect = document.getElementById("roomId");
        const daySelect = document.getElementById("day");
        const startTimeInput = document.getElementById("startTime");
        const endTimeInput = document.getElementById("endTime");
        const typeSelect = document.getElementById("type");
        const instructorSelect = document.getElementById("instructor");
        const courseSelect = document.getElementById("courseId");

        if (!roomSelect || !daySelect || !startTimeInput || !endTimeInput || !typeSelect || !instructorSelect || !courseSelect) {
            throw new Error('One or more form elements not found');
        }

        // Set form values
        roomSelect.value = slot.room_id || '';
        daySelect.value = slot.day || '';
        startTimeInput.value = slot.start_time || '';
        endTimeInput.value = slot.end_time || '';
        typeSelect.value = slot.type || '';
        instructorSelect.value = slot.instructor_id || '';
        courseSelect.value = slot.course_id || '';

        // Set form mode and slot ID
        const form = document.getElementById("timeSlotForm");
        if (!form) {
            throw new Error('Time slot form not found');
        }
        form.dataset.mode = "edit";
        form.dataset.slotId = slotId;

        // Show the modal
        const modal = new bootstrap.Modal(document.getElementById("timeSlotModal"));
        modal.show();
    } catch (error) {
        console.error("Error editing time slot:", error);
        if (typeof showError === 'function') {
            showError(`Failed to load time slot details: ${error.message}`);
        } else {
            alert(`Failed to load time slot details: ${error.message}`);
        }
    }
}

// Delete Time Slot
async function deleteTimeSlot(slotId) {
    try {
        // Fallback to native confirmation if SweetAlert is having issues
        let confirmed;
        
        try {
            // Try to use SweetAlert2 confirmation
            if (typeof showConfirmation === 'function') {
                confirmed = await showConfirmation("Are you sure you want to delete this time slot?");
            } else {
                confirmed = confirm("Are you sure you want to delete this time slot?");
            }
        } catch (confirmError) {
            // Fallback to native confirm if SweetAlert2 errors out
            console.error("Error with SweetAlert confirmation:", confirmError);
            confirmed = confirm("Are you sure you want to delete this time slot?");
        }
        
        if (!confirmed) return;

        // Show loading indicator (try/catch in case it fails)
        let loadingAlert = null;
        try {
            if (typeof showLoading === 'function') {
                loadingAlert = showLoading('Deleting time slot...');
            }
        } catch (loadingError) {
            console.error("Error showing loading indicator:", loadingError);
        }

        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/time-slots/${slotId}`, {
            method: "DELETE",
            headers: headers
        });

        // Close loading indicator (try/catch in case it fails)
        try {
            if (typeof closeLoading === 'function' && loadingAlert) {
                closeLoading(loadingAlert);
            }
        } catch (closeError) {
            console.error("Error closing loading indicator:", closeError);
        }

        if (!response.ok) throw new Error("Failed to delete time slot");

        loadTimeSlots();
        
        // Show success message (try/catch in case it fails)
        try {
            if (typeof showSuccess === 'function') {
                showSuccess("Time slot deleted successfully!");
            } else {
                alert("Time slot deleted successfully!");
            }
        } catch (successError) {
            console.error("Error showing success message:", successError);
            alert("Time slot deleted successfully!");
        }
    } catch (error) {
        console.error("Error deleting time slot:", error);
        // Show error message (try/catch in case it fails)
        try {
            if (typeof showError === 'function') {
                showError("Failed to delete time slot. Please try again.");
            } else {
                alert("Failed to delete time slot. Please try again.");
            }
        } catch (errorMsgError) {
            console.error("Error showing error message:", errorMsgError);
            alert("Failed to delete time slot. Please try again.");
        }
    }
}

// Close modal function
function closeModal() {
    const modal = bootstrap.Modal.getInstance(document.getElementById("timeSlotModal"));
    if (modal) {
        modal.hide();
    }
    const form = document.getElementById("timeSlotForm");
    form.reset();
    form.dataset.mode = "add";
    form.dataset.slotId = "";
}
