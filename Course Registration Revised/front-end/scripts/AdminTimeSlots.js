const API_BASE_URL = "http://127.0.0.1:8000/api/v1";

// Function to get token from local storage
function getAuthHeaders() {
    const token = localStorage.getItem("access_token");
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    };
}

document.addEventListener("DOMContentLoaded", function () {
    loadRooms();
    loadCourses();
    loadInstructors();
    loadTimeSlots();
});

// Load Rooms for Dropdown
async function loadRooms() {
    try {
        const response = await fetch(`${API_BASE_URL}/rooms/`);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const rooms = await response.json();
        const roomSelect = document.getElementById("room");
        roomSelect.innerHTML = '<option value="">Select Room</option>';

        rooms.forEach(room => {
            const option = document.createElement("option");
            option.value = room.room_id;
            option.textContent = `${room.building} - ${room.room_id}`;
            roomSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading rooms:", error);
    }
}

// Load Courses for Dropdown
async function loadCourses() {
    try {
        const response = await fetch(`${API_BASE_URL}/courses/`);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const courses = await response.json();
        const courseSelect = document.getElementById("course");
        courseSelect.innerHTML = '<option value="">Select Course</option>';

        courses.forEach(course => {
            const option = document.createElement("option");
            option.value = course.course_id;
            option.textContent = course.name;
            courseSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading courses:", error);
    }
}

// Load Instructors for Dropdown
async function loadInstructors() {
    try {
        const response = await fetch(`${API_BASE_URL}/users/`, {
            headers: getAuthHeaders(),
        });
        if(!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const users = await response.json();

        //Filter instructors only
        const instructors = users.filter(user => user.role === "instructor");

        const instructorSelect = document.getElementById("instructor");
        instructorSelect.innerHTML = '<option value="">Select Instructor</option>';

        instructors.forEach(instructor => {
            const option = document.createElement("option");
            option.value = instructor.instructor_id;
            option.textContent = instructor.name;
            instructorSelect.appendChild(option);
        });
    }catch(error){
        console.error("Error loading instructor", error);
    }
}

// Load Time Slots into Table
async function loadTimeSlots() {
    try {
        const response = await fetch(`${API_BASE_URL}/time-slots/`);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const timeSlots = await response.json();
        const tableBody = document.getElementById("timeSlotTableBody");
        tableBody.innerHTML = "";

        timeSlots.forEach(slot => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${slot.room_id}</td>
                <td>${slot.type}</td>
                <td>${slot.start_time}</td>
                <td>${slot.end_time}</td>
                <td>${slot.course_id ? slot.course_id : "N/A"}</td>
                <td>${slot.instructor_id ? slot.instructor_id : "N/A"}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editTimeSlot('${slot.slot_id}')">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteTimeSlot('${slot.slot_id}')">Delete</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error("Error loading time slots:", error);
    }
}

// Handle Form Submission for Adding/Editing Time Slots
document.getElementById("timeSlotForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    const slotData = {
        room_id: document.getElementById("room").value,
        day: document.getElementById("day").value,
        start_time: document.getElementById("start_time").value,
        end_time: document.getElementById("end_time").value,
        type: document.getElementById("slot_type").value,
        instructor_id: document.getElementById("instructor").value || null,
        course_id: document.getElementById("course").value || null
    };

    try {
        let url = `${API_BASE_URL}/time-slots/`;
        let method = "POST";

        if (this.dataset.mode === "edit") {
            url += this.dataset.slotId;
            method = "PUT";
        }

        const response = await fetch(url, {
            method: method,
            headers: getAuthHeaders(),
            body: JSON.stringify(slotData),
        });

        if (!response.ok) throw new Error("Failed to save time slot");

        loadTimeSlots();
        document.getElementById("timeSlotForm").reset();
        bootstrap.Modal.getInstance(document.getElementById("timeSlotModal")).hide();
    } catch (error) {
        console.error("Error saving time slot:", error);
    }
});

// Edit Time Slot
async function editTimeSlot(slotId) {
    try {
        const response = await fetch(`${API_BASE_URL}/time-slots/${slotId}`);
        if (!response.ok) throw new Error("Failed to fetch time slot");

        const slot = await response.json();
        document.getElementById("room").value = slot.room_id;
        document.getElementById("slot_type").value = slot.type;
        document.getElementById("start_time").value = slot.start_time;
        document.getElementById("end_time").value = slot.end_time;
        document.getElementById("course").value = slot.course_id || "";
        document.getElementById("instructor").value = slot.instructor_id || "";

        const form = document.getElementById("timeSlotForm");
        form.dataset.mode = "edit";
        form.dataset.slotId = slotId;

        bootstrap.Modal.getInstance(document.getElementById("timeSlotModal")).show();
    } catch (error) {
        console.error("Error editing time slot:", error);
    }
}

// Delete Time Slot
async function deleteTimeSlot(slotId) {
    if (!confirm("Are you sure you want to delete this time slot?")) return;

    try {
        const response = await fetch(`${API_BASE_URL}/time-slots/${slotId}`, {
            method: "DELETE",
            headers: getAuthHeaders(),
        });

        if (!response.ok) throw new Error("Failed to delete time slot");

        loadTimeSlots();
    } catch (error) {
        console.error("Error deleting time slot:", error);
    }
}
