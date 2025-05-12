from fastapi import APIRouter, HTTPException, Depends
from database import time_slots_collection, rooms_collection, courses_collection, users_collection
from models.TimeSlots import TimeSlot
from helpers.auth import get_current_user
from helpers.helpers import generate_slot_id

router = APIRouter()

# Create Time Slot
@router.post("/time-slots/")
async def create_time_slot(time_slot: TimeSlot, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized access")
    
    # Validate room existence
    room = await rooms_collection.find_one({"room_id": time_slot.room_id})
    if not room:
        raise HTTPException(status_code=400, detail="Invalid room ID")
    
    # Validate instructor existence (if provided)
    if time_slot.instructor_id:
        instructor = await users_collection.find_one({"instructor_id": time_slot.instructor_id})
        if not instructor:
            raise HTTPException(status_code=400, detail="Invalid instructor ID")
        
    # Validate course existence (if provided)
    if time_slot.course_id:
        course = await courses_collection.find_one({"course_id": time_slot.course_id})
        if not course:
            raise HTTPException(status_code=400, detail="Invalid course ID")
        
    # Prevent conflicting time slots for the same room
    existing_slot = await time_slots_collection.find_one({
        "room_id": time_slot.room_id,
        "day": time_slot.day,
        "$or" : [
            {"start_time": {"#lt": time_slot.end_time}}
        ]
    })
    if existing_slot:
        raise HTTPException(status_code=400, detail="Time slot conflicts with an existing booking")
    
    slot_id = await generate_slot_id()
    time_slot_data = time_slot.model_dump()
    time_slot_data["slot_id"] = slot_id
    
    await time_slots_collection.insert_one(time_slot_data)
    return {"message": "Time slot created successfully", "slot_id": slot_id}

# Get all time slots
@router.get("/time-slots/")
async def get_time_slots():
    time_slots = await time_slots_collection.find().to_list(100)
    return time_slots

# Get Time Slot by ID
@router.get("/time-slots/{slot_id}")
async def get_time_slot(slot_id: str):
    time_slot = await time_slots_collection.find_one({"slot_id": slot_id})
    if not time_slot:
        raise HTTPException(status_code=404, detail="Time slot not found")
    return time_slot

# Update Time Slot
@router.put("/time-slots/{slot_id}")
async def update_time_slot(slot_id: str, updated_data: dict, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized access")
    
    result = await time_slots_collection.update_one({"slot_id": slot_id}, {"$set": updated_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Time slot not found")
    return {"message": "Time slot updated successfully"}

#Delete time slot
@router.delete("/time-slots/{slot_id}")
async def delete_time_slot(slot_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized access")
    
    result = await time_slots_collection.delete_one({"slot_id": slot_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Time slot not found")
    
    return {"message": f"Time slot {slot_id} deleted successfully"}