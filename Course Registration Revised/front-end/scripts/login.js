document.getElementById("loginForm").addEventListener("submit", async function(event) {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    const errorMessage = document.getElementById("error-message");

    // Reset error message
    errorMessage.textContent = "";
    errorMessage.style.display = "none";

    // Basic Input Validation
    if (!email || !password) {
        errorMessage.textContent = "Email and password cannot be empty.";
        errorMessage.style.display = "block";
        return;
    }

    // Email Format Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if(!emailRegex.test(email)) {
        errorMessage.textContent = "Invalid email format.";
        errorMessage.style.display = "block";
        return;
    }

    // Show loading state
    const submitButton = this.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.textContent;
    submitButton.textContent = "Logging in...";
    submitButton.disabled = true;

    const formData = new URLSearchParams();
    formData.append("username", email);
    formData.append("password", password);

    try {
        const response = await fetch(`http://127.0.0.1:8000/api/auth/login`, {
            method: "POST",
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
            body: formData
        });

        if(!response.ok) {
            throw new Error("Invalid email or password");
        }

        const data = await response.json();
        
        // Store the token securely
        localStorage.setItem("access_token", data.access_token);
        
        // Parse the token to get user information
        const tokenParts = data.access_token.split(".");
        if (tokenParts.length !== 3) {
            throw new Error("Invalid token format");
        }
        
        try {
            const payload = JSON.parse(atob(tokenParts[1]));
            const role = payload.role;
            const userId = payload.user_id;
            
            // Store user info for session
            localStorage.setItem("user_role", role);
            localStorage.setItem("user_id", userId);
            localStorage.setItem("user_email", payload.sub);
            
            // Redirect based on role
            if(role === "admin") {
                window.location.href = "/front-end/html/AdminCourses.html";
            } else if(role === "instructor") {
                window.location.href = "/front-end/html/InstructorDashboard.html";
            } else if(role === "student") {
                window.location.href = "/front-end/html/StudentRegistration.html";
            } else {
                throw new Error("Unknown user role. Please contact support.");
            }
        } catch (parseError) {
            console.error("Token parsing error:", parseError);
            throw new Error("Error processing authentication. Please try again.");
        }
    } catch(error) {
        console.error("Login Error:", error.message);
        errorMessage.textContent = error.message;
        errorMessage.style.display = "block";
        
        // Reset button state
        submitButton.textContent = originalButtonText;
        submitButton.disabled = false;
    }
});

// Check if token exists and is valid on page load
document.addEventListener('DOMContentLoaded', function() {
    const token = localStorage.getItem("access_token");
    
    if (token) {
        try {
            // Check if token is expired
            const payload = JSON.parse(atob(token.split(".")[1]));
            const expiry = payload.exp * 1000; // Convert to milliseconds
            
            if (Date.now() < expiry) {
                // Token is still valid, redirect to appropriate dashboard
                const role = payload.role;
                
                if(role === "admin") {
                    window.location.href = "/front-end/html/AdminCourses.html";
                } else if(role === "instructor") {
                    window.location.href = "/front-end/html/InstructorDashboard.html";
                } else if(role === "student") {
                    window.location.href = "/front-end/html/StudentRegistration.html";
                }
            } else {
                // Token expired, remove it
                localStorage.removeItem("access_token");
                localStorage.removeItem("user_role");
                localStorage.removeItem("user_id");
                localStorage.removeItem("user_email");
            }
        } catch (e) {
            // Invalid token format, remove it
            localStorage.removeItem("access_token");
            localStorage.removeItem("user_role");
            localStorage.removeItem("user_id");
            localStorage.removeItem("user_email");
        }
    }
});