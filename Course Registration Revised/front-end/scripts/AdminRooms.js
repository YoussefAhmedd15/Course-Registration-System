const API_BASE_URL = "http://127.0.0.1:8000/api/v1/rooms"

//Function to get token from the local storage
function getAuthHeaders() {
  const token = localStorage.getItem("access_token");
  return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
  };
}

// Load rooms when the document is ready
document.addEventListener("DOMContentLoaded", () => {
  loadRooms()
})

// Fetch all rooms
async function loadRooms() {
  try {
    const response = await fetch(`${API_BASE_URL}`, {
      Method: "GET",
      header: getAuthHeaders(),
    });
    if (!response) throw new Error("Failed to fetch rooms")

    const rooms = await response.json()
    populateRoomTable(rooms)
  } catch (error) {
    console.error("Error loading rooms:", error)
    alert("An error occured while loading rooms.")
  }
}

// Populate table with rooms
function populateRoomTable(rooms) {
  const tableBody = document.getElementById("roomTableBody")
  tableBody.innerHTML = ""

  rooms.forEach((room) => {
    const row = document.createElement("tr")
    row.innerHTML = `
            <td>${room.room_id}</td>
            <td>${room.building}</td>
            <td>${room.room_number}</td>
            <td>${room.type}</td>
            <td>${room.capacity}</td>
            <td>
                <div class="dropdown">
                    <button class="btn btn-secondary btn-sm dropdown-toggle" type="button" id="dropdownMenuButton${room.room_id}" data-bs-toggle="dropdown" aria-expanded="false">
                        Actions
                    </button>
                    <ul class="dropdown-menu" aria-labelledby="dropdownMenuButton${room.room_id}">
                        <li><a class="dropdown-item edit-room" href="#" data-id="${room.room_id}">Edit</a></li>
                        <li><a class="dropdown-item delete-room text-danger" href="#" data-id="${room.room_id}">Delete</a></li>
                    </ul>
                </div>
            </td>
        `
    tableBody.appendChild(row)
  })

  // Add event listeners for edit and delete actions
  document.querySelectorAll(".edit-room").forEach((button) => {
    button.addEventListener("click", function (e) {
      e.preventDefault()
      const roomId = this.getAttribute("data-id")
      editRoom(roomId)
    })
  })

  // Add the missing event listener for delete buttons
  document.querySelectorAll(".delete-room").forEach((button) => {
    button.addEventListener("click", function (e) {
      e.preventDefault()
      const roomId = this.getAttribute("data-id")
      if (confirm("Are you sure you want to delete this room?")) {
        deleteRoom(roomId)
      }
    })
  })
}

// Open modal to create or update a room
async function createOrUpdateRoom(event) {
  event.preventDefault()

  const roomId = document.getElementById("roomForm").dataset.roomId
  const roomData = {
    building: document.getElementById("building").value,
    room_number: document.getElementById("room_number").value,
    capacity: document.getElementById("capacity").value,
    type: document.getElementById("type").value,
  }

  const method = roomId ? "PUT" : "POST"
  const url = roomId ? `${API_BASE_URL}/${roomId}` : `${API_BASE_URL}/`

  try {
    const response = await fetch(url, {
      method: method,
      headers: getAuthHeaders(),
      body: JSON.stringify(roomData),
    })

    if (!response.ok) throw new Error("Failed to save room")

    loadRooms()
    closeModal()
  } catch (error) {
    console.error("Error saving room:", error)
    alert("An error occured while saving the room.")
  }
}

// Fetch room details and open edit modal
async function editRoom(roomId) {
  try {
    const response = await fetch(`${API_BASE_URL}/${roomId}`, {
      method: "GET",
      headers: getAuthHeaders()
    })
    if (!response.ok) throw new Error("Failed to fetch room details")

    const room = await response.json()
    document.getElementById("building").value = room.building
    document.getElementById("room_number").value = room.room_number
    document.getElementById("capacity").value = room.capacity
    document.getElementById("type").value = room.type

    document.getElementById("roomForm").dataset.roomId = roomId

    const modal = new bootstrap.Modal(document.getElementById("roomModal"))
    modal.show()
  } catch (error) {
    console.error("Error fetching room details:", error)
    alert("An error occured while fetching room details")
  }
}

// Delete a room
async function deleteRoom(roomId) {
  try {
    const response = await fetch(`${API_BASE_URL}/${roomId}`, { method: "DELETE", headers: getAuthHeaders()})
    if (!response.ok) throw new Error("Failed to delete room")

    loadRooms()
  } catch (error) {
    console.error("Error deleting room:", error)
    alert("An error occured while deleting the room")
  }
}

// Close modal and reset form
function closeModal() {
  const modal = bootstrap.Modal.getInstance(document.getElementById("roomModal"))
  modal.hide()
  document.getElementById("roomForm").reset()
  delete document.getElementById("roomForm").dataset.roomId
}

// Event listener from form submission
document.getElementById("roomForm").addEventListener("submit", createOrUpdateRoom)

