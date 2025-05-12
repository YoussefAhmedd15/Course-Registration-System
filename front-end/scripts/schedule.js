// schedule.js - Frontend script for the Schedule page

document.addEventListener('DOMContentLoaded', function() {
    // Debug: Check token and user info
    console.log('Schedule.js loaded');
    console.log('Token exists:', !!localStorage.getItem('token'));
    console.log('User ID:', localStorage.getItem('userId'));
    console.log('User Role:', localStorage.getItem('userRole'));
    
    try {
        // Parse the token to validate it
        const token = localStorage.getItem('token');
        if (token) {
            const tokenParts = token.split('.');
            if (tokenParts.length === 3) {
                const payload = JSON.parse(atob(tokenParts[1]));
                console.log('Token payload valid:', !!payload);
                console.log('Token exp:', new Date(payload.exp * 1000));
                console.log('Token not expired:', new Date(payload.exp * 1000) > new Date());
            } else {
                console.error('Invalid token format');
            }
        }
    } catch (error) {
        console.error('Error parsing token:', error);
    }
    
    loadUserInfo();
    setupEventListeners();
    loadScheduleData();
});

// Token handling
function getToken() {
    return localStorage.getItem('token');
}

function getUserId() {
    return localStorage.getItem('userId');
}

function getUserRole() {
    return localStorage.getItem('userRole');
}

// User info and logout
function loadUserInfo() {
    const token = getToken();
    if (!token) {
        console.log('No token found, redirecting to login page');
        window.location.href = 'Login.html';
        return;
    }

    // Handle logout
    document.getElementById('logoutBtn').addEventListener('click', function() {
        console.log('Logging out...');
        localStorage.clear(); // Clear all localStorage items
        window.location.href = 'Login.html';
    });
}

function setupEventListeners() {
    // Semester selector event listener
    const semesterSelect = document.getElementById('semester-select');
    if (semesterSelect) {
        semesterSelect.addEventListener('change', function() {
            loadScheduleData(this.value);
        });
    }
}

// Main function to load schedule data
async function loadScheduleData(semester = 'current') {
    const loading = showLoading('Loading your schedule...');
    try {
        const userId = getUserId();
        if (!userId) {
            showError('User ID not found. Please log in again.');
            window.location.href = 'Login.html';
            return;
        }

        // Get the current active semester if none specified
        let semesterId = semester;
        if (semester === 'current') {
            try {
                const semesterResponse = await fetch('http://localhost:8000/api/v1/semester/active', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${getToken()}`
                    }
                });
                
                if (semesterResponse.ok) {
                    const semesterData = await semesterResponse.json();
                    semesterId = semesterData.semester_id;
                } else {
                    console.warn('Could not fetch active semester, using selected value instead');
                }
            } catch (error) {
                console.warn('Error fetching active semester:', error);
            }
        }

        // Get the schedule data
        const response = await fetch(`http://localhost:8000/api/v1/schedule/${userId}${semesterId ? `?semester=${semesterId}` : ''}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch schedule data: ${response.status} ${response.statusText}`);
        }

        const scheduleData = await response.json();
        updateScheduleUI(scheduleData);
        updateScheduleMetrics(scheduleData);
    } catch (error) {
        console.error('Error loading schedule:', error);
        showError('Failed to load schedule: ' + error.message);
    } finally {
        closeLoading(loading);
    }
}

// Update the schedule table with data from the API
function updateScheduleUI(scheduleData) {
    const scheduleTable = document.querySelector('.schedule-table tbody');
    if (!scheduleTable) return;

    // Clear existing schedule data (except time cells)
    const rows = scheduleTable.querySelectorAll('tr');
    rows.forEach(row => {
        const cells = row.querySelectorAll('td:not(.time-cell)');
        cells.forEach(cell => {
            cell.innerHTML = '';
            cell.removeAttribute('rowspan');
            cell.className = '';
        });
    });

    if (!scheduleData || !scheduleData.schedule || scheduleData.schedule.length === 0) {
        console.log('No schedule data found for this semester.');
        return;
    }

    // Process and display each course slot
    scheduleData.schedule.forEach(course => {
        if (!course.slots || course.slots.length === 0) return;
        
        course.slots.forEach(slot => {
            const { day, start_time, end_time, room_name, course_name, course_code, instructor_name, type } = slot;
            
            // Find the right row (by time) and column (by day)
            const rowIndex = findTimeRowIndex(start_time);
            const colIndex = findDayColumnIndex(day);
            
            if (rowIndex >= 0 && colIndex >= 0) {
                const row = rows[rowIndex];
                if (!row) return;
                
                const cell = row.children[colIndex];
                if (!cell) return;
                
                // Calculate rowspan based on duration
                const duration = calculateDuration(start_time, end_time);
                const rowSpan = Math.ceil(duration / 60); // Assuming 1 hour per row
                
                if (rowSpan > 1) {
                    cell.setAttribute('rowspan', rowSpan);
                    
                    // Clear cells below that would be covered by this rowspan
                    for (let i = 1; i < rowSpan && (rowIndex + i) < rows.length; i++) {
                        const rowBelow = rows[rowIndex + i];
                        if (rowBelow && rowBelow.children[colIndex]) {
                            rowBelow.removeChild(rowBelow.children[colIndex]);
                        }
                    }
                }
                
                // Add CSS class based on type
                cell.className = `course-slot ${type.toLowerCase()}`;
                
                // Create course details
                cell.innerHTML = `
                    <div class="course-details">
                        <h3>${course_name || 'Unnamed Course'}</h3>
                        <p>${course_code || 'No Code'} | ${type || 'Unknown'}</p>
                        <p>${instructor_name || 'No Instructor'}</p>
                        <p>${room_name || 'No Room'}</p>
                    </div>
                `;
            }
        });
    });
}

// Helper function to find row index based on time
function findTimeRowIndex(timeStr) {
    const timeRows = {
        '08:00': 0, '8:00': 0,
        '09:00': 1, '9:00': 1,
        '10:00': 2,
        '11:00': 3,
        '12:00': 4,
        '13:00': 5, '1:00': 5,
        '14:00': 6, '2:00': 6
    };
    
    // Convert HH:MM:SS to HH:MM format
    const timeParts = timeStr.split(':');
    const hour = timeParts[0].padStart(2, '0');
    const minutes = timeParts.length > 1 ? timeParts[1] : '00';
    const formattedTime = `${hour}:${minutes}`;
    
    // Find the closest row
    return timeRows[formattedTime] !== undefined ? timeRows[formattedTime] : -1;
}

// Helper function to find column index based on day
function findDayColumnIndex(day) {
    const dayColumns = {
        'Sunday': 1,
        'Monday': 2,
        'Tuesday': 3,
        'Wednesday': 4,
        'Thursday': 5,
        'Friday': 6,
        'Saturday': 7
    };
    return dayColumns[day] !== undefined ? dayColumns[day] : -1;
}

// Calculate duration between start and end time in minutes
function calculateDuration(startTime, endTime) {
    try {
        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);
        
        return ((endHour * 60 + endMin) - (startHour * 60 + startMin));
    } catch (error) {
        console.error('Error calculating duration:', error, startTime, endTime);
        return 60; // Default to 1 hour if calculation fails
    }
}

// Update the schedule metrics at the top of the page
function updateScheduleMetrics(scheduleData) {
    if (!scheduleData || !scheduleData.schedule) return;
    
    const courseCount = scheduleData.schedule.length;
    
    // Calculate total credit hours
    let totalCredits = 0;
    scheduleData.schedule.forEach(course => {
        totalCredits += parseInt(course.credit_hours || 0);
    });
    
    // Calculate weekly class hours
    let weeklyHours = 0;
    scheduleData.schedule.forEach(course => {
        if (course.slots && Array.isArray(course.slots)) {
            course.slots.forEach(slot => {
                try {
                    const duration = calculateDuration(slot.start_time, slot.end_time);
                    weeklyHours += duration / 60; // Convert minutes to hours
                } catch (e) {
                    console.error('Error calculating weekly hours:', e);
                }
            });
        }
    });
    
    // Update UI
    const coursesElement = document.querySelector('.info-cards .info-card:nth-child(1) .number');
    const creditsElement = document.querySelector('.info-cards .info-card:nth-child(2) .number');
    const hoursElement = document.querySelector('.info-cards .info-card:nth-child(3) .number');
    
    if (coursesElement) coursesElement.textContent = courseCount;
    if (creditsElement) creditsElement.textContent = totalCredits;
    if (hoursElement) hoursElement.textContent = Math.round(weeklyHours);
} 