// Base API URL
const API_URL = 'http://localhost:8000/api/v1';
const AUTH_URL = 'http://localhost:8000/api';

// DOM Elements
const studentCountEl = document.getElementById('studentCount');
const courseCountEl = document.getElementById('courseCount');
const instructorCountEl = document.getElementById('instructorCount');
const roomCountEl = document.getElementById('roomCount');
const adminNameEl = document.getElementById('adminName');
const adminInitialsEl = document.getElementById('adminInitials');
const recentActivitiesEl = document.getElementById('recentActivities');
const currentSemesterEl = document.getElementById('currentSemester');
const academicYearEl = document.getElementById('academicYear');
const startDateEl = document.getElementById('startDate');
const endDateEl = document.getElementById('endDate');
const semesterForm = document.getElementById('semesterForm');
const logoutBtn = document.getElementById('logoutBtn');

// Registration periods elements
const registrationToggle = document.getElementById('registrationToggle');
const withdrawalToggle = document.getElementById('withdrawalToggle');
const registrationStatusBadge = document.getElementById('registrationStatusBadge');
const withdrawalStatusBadge = document.getElementById('withdrawalStatusBadge');
const registrationStartDate = document.getElementById('registrationStartDate');
const registrationEndDate = document.getElementById('registrationEndDate');
const withdrawalStartDate = document.getElementById('withdrawalStartDate');
const withdrawalEndDate = document.getElementById('withdrawalEndDate');
const registrationForm = document.getElementById('registrationForm');

// Registration modal elements
const registrationEnabledModal = document.getElementById('registrationEnabledModal');
const withdrawalEnabledModal = document.getElementById('withdrawalEnabledModal');
const registrationStartDateModal = document.getElementById('registrationStartDateModal');
const registrationEndDateModal = document.getElementById('registrationEndDateModal');
const withdrawalStartDateModal = document.getElementById('withdrawalStartDateModal');
const withdrawalEndDateModal = document.getElementById('withdrawalEndDateModal');

// Format date to ISO string without milliseconds
function formatDateToISO(date) {
    return date ? new Date(date).toISOString().slice(0, 16) : '';
}

// Format date to display string
function formatDateToDisplay(date) {
    if (!date) return '-';
    return new Date(date).toLocaleString();
}

// Check if user is logged in
function checkAuth() {
    const token = localStorage.getItem('token');
    const userRole = localStorage.getItem('userRole');
    
    if (!token || userRole !== 'admin') {
        clearAuthStorage();
        window.location.href = 'Login.html';
        return null;
    }
    
    // Validate token expiration
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expiry = payload.exp * 1000; // Convert to milliseconds
        
        if (Date.now() >= expiry) {
            // Token expired, try to refresh
            const refreshToken = localStorage.getItem('refreshToken');
            if (refreshToken) {
                refreshAccessToken(refreshToken);
                return null;
            } else {
                clearAuthStorage();
                window.location.href = 'Login.html';
                return null;
            }
        }
        
        return token;
    } catch (e) {
        clearAuthStorage();
        window.location.href = 'Login.html';
        return null;
    }
}

// Get admin info
function loadAdminInfo() {
    const adminName = localStorage.getItem('userName') || 'Administrator';
    adminNameEl.textContent = adminName;
    
    // Set initials
    const nameParts = adminName.split(' ');
    const initials = nameParts.length > 1 
        ? nameParts[0][0] + nameParts[1][0] 
        : adminName.substring(0, 2);
    adminInitialsEl.textContent = initials.toUpperCase();
}

// Fetch counts
async function fetchCounts() {
    const token = checkAuth();
    
    try {
        // Fetch all users to count students and instructors
        const usersResponse = await fetch(`${API_URL}/users/`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (usersResponse.ok) {
            const usersData = await usersResponse.json();
            
            // Count students and instructors
            let studentCount = 0;
            let instructorCount = 0;
            
            usersData.forEach(user => {
                if (user.role === 'student') {
                    studentCount++;
                } else if (user.role === 'instructor') {
                    instructorCount++;
                }
            });
            
            studentCountEl.textContent = studentCount;
            instructorCountEl.textContent = instructorCount;
        }
        
        // Fetch courses
        const coursesResponse = await fetch(`${API_URL}/courses/`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (coursesResponse.ok) {
            const coursesData = await coursesResponse.json();
            courseCountEl.textContent = coursesData.length;
        }
        
        // Fetch rooms
        const roomsResponse = await fetch(`${API_URL}/rooms/`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (roomsResponse.ok) {
            const roomsData = await roomsResponse.json();
            roomCountEl.textContent = roomsData.length;
        }
    } catch (error) {
        console.error('Error fetching counts:', error);
    }
}

// Fetch recent activities
async function fetchRecentActivities() {
    const token = checkAuth();
    
    try {
        // For now, we'll use mock data since the API endpoint isn't ready
        generateMockActivities();
        
        // TODO: Uncomment this when the API endpoint is ready
        /*
        const response = await fetch(`${API_URL}/activities/recent`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const activities = await response.json();
            displayRecentActivities(activities);
        } else {
            console.error('Failed to fetch recent activities');
            generateMockActivities();
        }
        */
    } catch (error) {
        console.error('Error fetching recent activities:', error);
        generateMockActivities();
    }
}

// Display recent activities
function displayRecentActivities(activities) {
    if (!recentActivitiesEl) {
        console.error('Recent activities element not found');
        return;
    }
    
    recentActivitiesEl.innerHTML = '';
    
    if (!activities || activities.length === 0) {
        recentActivitiesEl.innerHTML = `
            <div class="activity-item">
                <div class="activity-icon bg-secondary-light">
                    <i class="bi bi-info-circle"></i>
                </div>
                <div class="activity-details">
                    <p>No recent activities</p>
                    <small class="text-muted">Check back later for updates</small>
                </div>
            </div>
        `;
        return;
    }
    
    activities.forEach(activity => {
        const activityItem = document.createElement('div');
        activityItem.className = 'activity-item';
        
        // Determine icon and background class based on activity type
        const { icon, bgClass } = getActivityStyle(activity.type);
        
        activityItem.innerHTML = `
            <div class="activity-icon ${bgClass}">
                <i class="bi ${icon}"></i>
            </div>
            <div class="activity-details">
                <p>${activity.description}</p>
                <small class="text-muted">${formatActivityTime(activity.timestamp)}</small>
            </div>
        `;
        recentActivitiesEl.appendChild(activityItem);
    });
}

// Get activity style based on type
function getActivityStyle(type) {
    const styles = {
        'user': { icon: 'bi-person', bgClass: 'bg-primary-light' },
        'course': { icon: 'bi-book', bgClass: 'bg-success-light' },
        'room': { icon: 'bi-building', bgClass: 'bg-info-light' },
        'instructor': { icon: 'bi-person-workspace', bgClass: 'bg-warning-light' },
        'semester': { icon: 'bi-calendar-event', bgClass: 'bg-danger-light' },
        'registration': { icon: 'bi-pencil-square', bgClass: 'bg-primary-light' },
        'withdrawal': { icon: 'bi-x-circle', bgClass: 'bg-danger-light' },
        'default': { icon: 'bi-info-circle', bgClass: 'bg-secondary-light' }
    };
    
    return styles[type] || styles.default;
}

// Format activity timestamp
function formatActivityTime(timestamp) {
    if (!timestamp) return 'Unknown time';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) {
        return 'Just now';
    } else if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60);
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 604800) {
        const days = Math.floor(diffInSeconds / 86400);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    } else {
        return date.toLocaleDateString();
    }
}

// Generate mock activities
function generateMockActivities() {
    const activities = [
        {
            type: 'user',
            description: 'New student registered',
            timestamp: new Date().toISOString()
        },
        {
            type: 'course',
            description: 'Course "Database Systems" added',
            timestamp: new Date(Date.now() - 7200000).toISOString() // 2 hours ago
        },
        {
            type: 'room',
            description: 'Room H203 updated',
            timestamp: new Date(Date.now() - 86400000).toISOString() // 1 day ago
        },
        {
            type: 'instructor',
            description: 'Instructor assigned to CS101',
            timestamp: new Date(Date.now() - 172800000).toISOString() // 2 days ago
        },
        {
            type: 'semester',
            description: 'Semester settings updated',
            timestamp: new Date(Date.now() - 604800000).toISOString() // 1 week ago
        }
    ];
    
    displayRecentActivities(activities);
}

// Fetch semester settings
async function fetchSemesterSettings() {
    const token = checkAuth();
    
    try {
        const response = await fetch(`${API_URL}/semester/current`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            currentSemesterEl.textContent = data.current_semester || '-';
            academicYearEl.textContent = data.academic_year || '-';
            
            // Format dates for display
            if (data.start_date) {
                startDateEl.textContent = new Date(data.start_date).toLocaleDateString();
            }
            
            if (data.end_date) {
                endDateEl.textContent = new Date(data.end_date).toLocaleDateString();
            }
            
            // Set form values
            document.getElementById('semesterType').value = data.current_semester || 'Fall';
            document.getElementById('semesterYear').value = data.academic_year || '';
            document.getElementById('semesterStartDate').value = data.start_date ? data.start_date.split('T')[0] : '';
            document.getElementById('semesterEndDate').value = data.end_date ? data.end_date.split('T')[0] : '';
            
            // Handle registration periods
            if (data.registration_periods) {
                updateRegistrationPeriodsUI(data.registration_periods);
            }
        }
    } catch (error) {
        console.error('Error fetching semester settings:', error);
    }
}

// Update registration periods UI
function updateRegistrationPeriodsUI(regPeriods) {
    // Update toggles
    registrationToggle.checked = regPeriods.registration_enabled || false;
    withdrawalToggle.checked = regPeriods.withdrawal_enabled || false;
    
    // Update badges
    registrationStatusBadge.textContent = regPeriods.registration_enabled ? 'Enabled' : 'Disabled';
    registrationStatusBadge.className = regPeriods.registration_enabled ? 'badge bg-success' : 'badge bg-danger';
    
    withdrawalStatusBadge.textContent = regPeriods.withdrawal_enabled ? 'Enabled' : 'Disabled';
    withdrawalStatusBadge.className = regPeriods.withdrawal_enabled ? 'badge bg-success' : 'badge bg-danger';
    
    // Update dates
    registrationStartDate.textContent = formatDateToDisplay(regPeriods.registration_start_date);
    registrationEndDate.textContent = formatDateToDisplay(regPeriods.registration_end_date);
    withdrawalStartDate.textContent = formatDateToDisplay(regPeriods.withdrawal_start_date);
    withdrawalEndDate.textContent = formatDateToDisplay(regPeriods.withdrawal_end_date);
    
    // Update modal values
    registrationEnabledModal.checked = regPeriods.registration_enabled || false;
    withdrawalEnabledModal.checked = regPeriods.withdrawal_enabled || false;
    
    registrationStartDateModal.value = formatDateToISO(regPeriods.registration_start_date);
    registrationEndDateModal.value = formatDateToISO(regPeriods.registration_end_date);
    withdrawalStartDateModal.value = formatDateToISO(regPeriods.withdrawal_start_date);
    withdrawalEndDateModal.value = formatDateToISO(regPeriods.withdrawal_end_date);
}

// Toggle registration enabled status
registrationToggle.addEventListener('change', async () => {
    const token = checkAuth();
    const isEnabled = registrationToggle.checked;
    
    try {
        const response = await fetch(`${API_URL}/semester/current`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const regPeriods = data.registration_periods || {};
            
            // Update registration_enabled
            regPeriods.registration_enabled = isEnabled;
            
            // PUT to update
            await updateRegistrationPeriods(regPeriods);
        }
    } catch (error) {
        console.error('Error toggling registration status:', error);
        registrationToggle.checked = !isEnabled; // Revert toggle if failed
    }
});

// Toggle withdrawal enabled status
withdrawalToggle.addEventListener('change', async () => {
    const token = checkAuth();
    const isEnabled = withdrawalToggle.checked;
    
    try {
        const response = await fetch(`${API_URL}/semester/current`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const regPeriods = data.registration_periods || {};
            
            // Update withdrawal_enabled
            regPeriods.withdrawal_enabled = isEnabled;
            
            // PUT to update
            await updateRegistrationPeriods(regPeriods);
        }
    } catch (error) {
        console.error('Error toggling withdrawal status:', error);
        withdrawalToggle.checked = !isEnabled; // Revert toggle if failed
    }
});

// Update registration periods
async function updateRegistrationPeriods(regPeriods) {
    const token = checkAuth();
    
    try {
        // Show loading indicator
        const loadingAlert = typeof showLoading === 'function' ? 
            showLoading('Updating registration periods...') : null;
            
        const response = await fetch(`${API_URL}/semester/registration`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(regPeriods)
        });
        
        // Close loading indicator
        if (typeof closeLoading === 'function') {
            closeLoading(loadingAlert);
        }
        
        if (response.ok) {
            const data = await response.json();
            if (data.registration_periods) {
                updateRegistrationPeriodsUI(data.registration_periods);
            }
            
            // Close the modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('registrationModal'));
            if (modal) {
                modal.hide();
            }
            
            // Show success message
            if (typeof showSuccess === 'function') {
                showSuccess('Registration periods updated successfully!');
            } else {
                alert('Registration periods updated successfully!');
            }
        } else {
            throw new Error('Failed to update registration periods');
        }
    } catch (error) {
        console.error('Error updating registration periods:', error);
        if (typeof showError === 'function') {
            showError('Failed to update registration periods. Please try again.');
        } else {
            alert('Failed to update registration periods. Please try again.');
        }
    }
}

// Handle logout
logoutBtn.addEventListener('click', async () => {
    // Show brief loading message
    const loadingAlert = typeof showLoading === 'function' ? 
        showLoading('Logging out...') : null;
    
    // Clear auth storage
    clearAuthStorage();
    
    // Close loading if present
    if (typeof closeLoading === 'function') {
        closeLoading(loadingAlert);
    }
    
    // Redirect to login page
    window.location.href = 'Login.html';
});

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

// Function to refresh access token
async function refreshAccessToken(refreshToken) {
    try {
        // Show loading indicator
        const loadingAlert = typeof showLoading === 'function' ? 
            showLoading('Refreshing session...') : null;
            
        const response = await fetch(`${AUTH_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refresh_token: refreshToken })
        });

        // Close loading indicator
        if (typeof closeLoading === 'function') {
            closeLoading(loadingAlert);
        }

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('token', data.access_token);
            localStorage.setItem('refreshToken', data.refresh_token);
            
            // Redirect to appropriate dashboard
            const payload = JSON.parse(atob(data.access_token.split('.')[1]));
            const role = payload.role;
            
            if(role === 'admin') {
                window.location.href = 'AdminDashboard.html';
            } else if(role === 'instructor') {
                window.location.href = 'InstructorDashboard.html';
            } else if(role === 'student') {
                window.location.href = 'StudentDashboard.html';
            }
        } else {
            if (typeof showError === 'function') {
                showError('Session expired. Please login again.');
            }
            clearAuthStorage();
            window.location.href = 'Login.html';
        }
    } catch (error) {
        console.error('Token refresh error:', error);
        if (typeof showError === 'function') {
            showError('Authentication error. Please login again.');
        }
        clearAuthStorage();
        window.location.href = 'Login.html';
    }
}

// Handle semester form submission
semesterForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = checkAuth();
    
    const semesterType = document.getElementById('semesterType').value;
    const academicYear = document.getElementById('semesterYear').value;
    const startDate = document.getElementById('semesterStartDate').value;
    const endDate = document.getElementById('semesterEndDate').value;
    
    try {
        const response = await fetch(`${API_URL}/semester/current`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                current_semester: semesterType,
                academic_year: academicYear,
                start_date: startDate,
                end_date: endDate
            })
        });
        
        if (response.ok) {
            // Update the semester info on page
            fetchSemesterSettings();
            
            // Close the modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('semesterModal'));
            modal.hide();
            
            alert('Semester settings updated successfully!');
        } else {
            alert('Failed to update semester settings.');
        }
    } catch (error) {
        console.error('Error updating semester settings:', error);
        alert('Error updating semester settings. Please try again.');
    }
});

// Initialize the dashboard
function initDashboard() {
    const token = checkAuth();
    if (!token) return; // Stop initialization if not authenticated
    
    loadAdminInfo();
    fetchCounts();
    fetchRecentActivities();
    fetchSemesterSettings();
    
    // Setup form event handlers
    setupEventHandlers();
}

// Setup all event handlers
function setupEventHandlers() {
    // Logout button
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            logout();
        });
    }
    
    // Semester form submission
    if (semesterForm) {
        semesterForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const semesterType = document.getElementById('semesterType').value;
            const academicYear = document.getElementById('semesterYear').value;
            const startDate = document.getElementById('semesterStartDate').value;
            const endDate = document.getElementById('semesterEndDate').value;
            
            // Validate dates
            if (new Date(startDate) >= new Date(endDate)) {
                if (typeof showError === 'function') {
                    showError('End date must be after start date');
                } else {
                    alert('End date must be after start date');
                }
                return;
            }
            
            const semesterData = {
                semester: semesterType,
                academic_year: academicYear,
                start_date: startDate,
                end_date: endDate
            };
            
            const token = checkAuth();
            if (!token) return;
            
            try {
                // Show loading indicator
                const loadingAlert = typeof showLoading === 'function' ? 
                    showLoading('Saving semester settings...') : null;
                    
                const response = await fetch(`${API_URL}/semester/settings`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(semesterData)
                });
                
                // Close loading indicator
                if (typeof closeLoading === 'function') {
                    closeLoading(loadingAlert);
                }
                
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.detail || 'Failed to save semester settings');
                }
                
                // Show success message
                if (typeof showSuccess === 'function') {
                    showSuccess('Semester settings saved successfully');
                } else {
                    alert('Semester settings saved successfully');
                }
                
                // Update UI with new settings
                currentSemesterEl.textContent = semesterType;
                academicYearEl.textContent = academicYear;
                startDateEl.textContent = new Date(startDate).toLocaleDateString();
                endDateEl.textContent = new Date(endDate).toLocaleDateString();
                
                // Close modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('semesterModal'));
                if (modal) {
                    modal.hide();
                }
                
            } catch (error) {
                console.error('Error saving semester settings:', error);
                if (typeof showError === 'function') {
                    showError(error.message || 'Failed to save semester settings');
                } else {
                    alert(error.message || 'Failed to save semester settings');
                }
            }
        });
    }
    
    // Registration form submission
    if (registrationForm) {
        registrationForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const regSettings = {
                registration_allowed: registrationEnabledModal.checked,
                withdrawal_allowed: withdrawalEnabledModal.checked,
                registration_start_date: registrationStartDateModal.value ? new Date(registrationStartDateModal.value).toISOString() : null,
                registration_end_date: registrationEndDateModal.value ? new Date(registrationEndDateModal.value).toISOString() : null,
                withdrawal_start_date: withdrawalStartDateModal.value ? new Date(withdrawalStartDateModal.value).toISOString() : null,
                withdrawal_end_date: withdrawalEndDateModal.value ? new Date(withdrawalEndDateModal.value).toISOString() : null
            };
            
            // Validate registration dates if enabled
            if (regSettings.registration_allowed && regSettings.registration_start_date && regSettings.registration_end_date) {
                if (new Date(regSettings.registration_start_date) >= new Date(regSettings.registration_end_date)) {
                    if (typeof showError === 'function') {
                        showError('Registration end date must be after start date');
                    } else {
                        alert('Registration end date must be after start date');
                    }
                    return;
                }
            }
            
            // Validate withdrawal dates if enabled
            if (regSettings.withdrawal_allowed && regSettings.withdrawal_start_date && regSettings.withdrawal_end_date) {
                if (new Date(regSettings.withdrawal_start_date) >= new Date(regSettings.withdrawal_end_date)) {
                    if (typeof showError === 'function') {
                        showError('Withdrawal end date must be after start date');
                    } else {
                        alert('Withdrawal end date must be after start date');
                    }
                    return;
                }
            }
            
            await updateRegistrationPeriods(regSettings);
        });
    }
    
    // Toggle switches for registration and withdrawal
    if (registrationToggle) {
        registrationToggle.addEventListener('change', async function() {
            const regSettings = await fetchRegistrationStatus();
            regSettings.registration_allowed = this.checked;
            await updateRegistrationPeriods(regSettings);
        });
    }
    
    if (withdrawalToggle) {
        withdrawalToggle.addEventListener('change', async function() {
            const regSettings = await fetchRegistrationStatus();
            regSettings.withdrawal_allowed = this.checked;
            await updateRegistrationPeriods(regSettings);
        });
    }
}

// Start initialization when document is ready
document.addEventListener('DOMContentLoaded', initDashboard);
