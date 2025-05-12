from fastapi import APIRouter, HTTPException, Depends
from database import rooms_collection
from models.Rooms import Room, RoomUpdate
from helpers.auth import get_current_user
from helpers.helpers import generate_room_id

router = APIRouter()

# Create room
@router.post("/rooms/")
async def create_room(room: Room, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized access")
    
    room_id = await generate_room_id(room.building, room.room_number)
    room_data = room.model_dump()
    room_data["room_id"] = room_id
    
    await rooms_collection.insert_one(room_data)
    return {"message": "Room created successfully", "room_id": room_id}

# Get all rooms
@router.get("/rooms/")
async def get_rooms():
    rooms = await rooms_collection.find().to_list(100)
    for room in rooms:
        room["_id"] = str(room["_id"])
    
    return rooms

# Get room by ID
@router.get("/rooms/{room_id}")
async def get_room(room_id: str):
    room = await rooms_collection.find_one({"room_id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    room["_id"] = str(room["_id"])  # Convert ObjectId to string
    return room

# Update room
@router.put("/rooms/{room_id}")
async def update_room(room_id: str, room: RoomUpdate, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized access")
    
    update_data = room.model_dump(exclude_unset=True)
    
    result = await rooms_collection.update_one(
        {"room_id": room_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Room not found")
    
    return {"message": "Room updated successfully"}

#Delete Room
@router.delete("/rooms/{room_id}")
async def delete_room(room_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized access")
    
    result = await rooms_collection.delete_one({"room_id": room_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Room not found")
    
    return {"message": f"Room {room_id} delete successfully"}