from fastapi import APIRouter, Depends, HTTPException, Query
from models.Schedules import Schedule
from database import schedules_collection, courses_collection, enrollments_collection, time_slots_collection, rooms_collection, users_collection
from helpers.auth import get_current_user
from typing import Optional
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/schedule/")
async def create_schedule(schedule: Schedule, user: dict = Depends(get_current_user)):
    """Handles scheduling process (time slot selection & conflicts)"""
    
    # Handle both dictionary access and object attribute access for user role
    try:
        user_role = user["role"]
        user_id = user["user_id"]
    except (KeyError, TypeError):
        # Try object attribute access
        user_role = getattr(user, "role", None)
        user_id = getattr(user, "user_id", None)
    
    if user_role != "student":
        raise HTTPException(status_code=403, detail="Only students can create schedules")
    
    student_id = user_id
    
    #Ensure student is enrolled in the course
    enrollment = await enrollments_collection.find_one({"student_id": student_id, "course_id": schedule.course_id})
    if not enrollment:
        raise HTTPException(status_code=400, detail="You must enroll in this course before scheduling")
    
    #Get course data
    course = await courses_collection.find_one({"course_id": schedule.course_id})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    #Ensure student selects required sessions (Lecture, Lab, etc.)
    required_sessions = course.get("required_sessions", [])
    for session in required_sessions:
        if not any(session in slot for slot in schedule.selected_slots):
            raise HTTPException(status_code=400, detail=f"{session} is required for {course['name']}")
        
    #Check for scheduling conflicts
    for slot in schedule.selected_slots:
        conflict = await schedules_collection.find_one({"student_id": student_id, "selected_slots": {"$in": [slot]}})
        if conflict:
            conflict_course = await courses_collection.find_one({"course_id": conflict["course_id"]})
            course_name = conflict_course["name"] if conflict_course else "Unknown Course"
            raise HTTPException(status_code=400, detail=f"Time conflict detected for {slot} with {course_name}")
        
    
    #Check seat availability
    for slot in schedule.selected_slots:
        slot_data = await courses_collection.find_one({"course_id": schedule.course_id, f"available_slots.{slot}":{"$gte": 1}})
        if not slot_data:
            raise HTTPException(status_code=400, detail=f"No available seats for {slot}")
        
    #Save schedule
    await schedules_collection.insert_one(schedule.model_dump())
    
    #Reduce seat availability
    for slot in schedule.selected_slots:
        await courses_collection.update_one(
            {"course_id": schedule.course_id},
            {"$inc":{f"available_slots.{slot}": -1}}
        )
        
    #Mark enrollment as "Completed"
    await enrollments_collection.update_one({"student_id": student_id, "course_id": schedule.course_id}, {"$set":{"status": "Completed"}})
    
    return {"message": "Schedule created successfully"}

#Reset the schedule (remove time slots while keeping enrollments intact)
@router.delete("/schedule/reset/{student_id}")
async def reset_student_schedule(student_id: str, user: dict = Depends(get_current_user)):
    """Allows schedule reset"""
    
    # Handle both dictionary access and object attribute access for user role
    try:
        user_role = user["role"]
        user_id = user["user_id"]
    except (KeyError, TypeError):
        # Try object attribute access
        user_role = getattr(user, "role", None)
        user_id = getattr(user, "user_id", None)
    
    # Check if user is the student or an admin
    if user_role not in ["admin"] and user_id != student_id:
        raise HTTPException(status_code=403, detail="Unauthorized to reset this schedule")
    
    #Find student's schedule
    schedules = await schedules_collection.find({"student_id": student_id}).to_list(None)
    if not schedules:
        raise HTTPException(status_code=404, detail="No schedule found for this student")
    
    #Restore seat availability
    for schedule in schedules:
        for slot in schedule["selected_slots"]:
            await courses_collection.update_one(
                {"course_id": schedule["course_id"]}, 
                {"$inc": {f"available_slots.{slot}": 1}}
            )
            
    #Remove all schedules for this student
    result = await schedules_collection.delete_many({"student_id": student_id})
    
    #Reset enrollment status to "Pending"
    await enrollments_collection.update_many(
        {"student_id": student_id, "status": "Completed"}, 
        {"$set": {"status": "Pending"}}
    )
    
    return {"message": f"Schedule for student {student_id} has been reset", "deleted_count": result.deleted_count}

#View student schedule with enriched data
@router.get("/schedule/{student_id}")
async def get_student_schedule(
    student_id: str, 
    semester: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Retrieve a student's schedule with detailed slot information"""
    
    try:
        # Handle both dictionary access and object attribute access for user role
        try:
            user_role = user["role"]
            user_id = user["user_id"]
        except (KeyError, TypeError):
            # Try object attribute access
            user_role = getattr(user, "role", None)
            user_id = getattr(user, "user_id", None)
        
        # Permissions check
        if user_role not in ["student", "instructor", "admin"]:
            raise HTTPException(status_code=403, detail="Unauthorized access")
        
        # Ensure student is viewing their own schedule (unless admin/instructor)
        if user_role == "student" and user_id != student_id:
            raise HTTPException(status_code=403, detail="Unauthorized access to this schedule")
        
        # Build query
        query = {"student_id": student_id}
        if semester:
            query["semester_id"] = semester
        
        # Get schedule details
        schedules = await schedules_collection.find(query).to_list(None)
        if not schedules:
            logger.info(f"No schedule found for student {student_id}")
            return {"student_id": student_id, "schedule": []}
        
        # Create enriched schedule with details for UI rendering
        enriched_schedule = []
        
        for schedule in schedules:
            course_id = schedule["course_id"]
            course = await courses_collection.find_one({"course_id": course_id})
            
            if not course:
                logger.warning(f"Course {course_id} not found for schedule entry")
                continue
                
            slot_details = []
            
            # Get details for each slot
            for slot_id in schedule.get("selected_slots", []):
                try:
                    slot = await time_slots_collection.find_one({"slot_id": slot_id})
                    
                    if slot:
                        # Get room details
                        room = await rooms_collection.find_one({"room_id": slot["room_id"]})
                        room_name = room["name"] if room else "Unknown Room"
                        
                        # Get instructor details
                        instructor = await users_collection.find_one({"user_id": slot["instructor_id"]})
                        instructor_name = f"{instructor['first_name']} {instructor['last_name']}" if instructor else "TBA"
                        
                        slot_details.append({
                            "slot_id": slot["slot_id"],
                            "day": slot["day"],
                            "start_time": slot["start_time"].strftime("%H:%M") if hasattr(slot["start_time"], "strftime") else slot["start_time"],
                            "end_time": slot["end_time"].strftime("%H:%M") if hasattr(slot["end_time"], "strftime") else slot["end_time"],
                            "type": slot["type"],
                            "room_id": slot["room_id"],
                            "room_name": room_name,
                            "instructor_id": slot["instructor_id"],
                            "instructor_name": instructor_name,
                            "course_name": course["name"],
                            "course_code": course["code"]
                        })
                except Exception as e:
                    logger.error(f"Error processing slot {slot_id}: {str(e)}")
            
            enriched_schedule.append({
                "course_id": course_id,
                "course_name": course["name"],
                "course_code": course["code"],
                "credit_hours": course.get("credit_hours", 0),
                "semester_id": schedule.get("semester_id", "Unknown"),
                "slots": slot_details
            })
        
        # Get student details
        student = await users_collection.find_one({"user_id": student_id})
        student_name = f"{student['first_name']} {student['last_name']}" if student else "Unknown Student"
        
        return {
            "student_id": student_id,
            "student_name": student_name,
            "schedule": enriched_schedule
        }
    except Exception as e:
        logger.error(f"Error in get_student_schedule: {str(e)}")
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")

# Add a new endpoint to get available time slots for a specific course
@router.get("/schedule/available-slots/{course_id}")
async def get_available_slots(
    course_id: str, 
    semester_id: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Get available time slots for a specific course"""
    
    try:
        # Get course data
        course = await courses_collection.find_one({"course_id": course_id})
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        
        # Apply semester filter if provided
        query = {"course_id": course_id}
        if semester_id:
            query["semester_id"] = semester_id
        
        # Get all available slots for this course
        available_slots = []
        
        # Find slots assigned to this course
        course_slots = await time_slots_collection.find(query).to_list(None)
        
        for slot in course_slots:
            # Check availability
            seats_available = course.get("available_slots", {}).get(slot["slot_id"], 0)
            
            if seats_available > 0:
                # Get room details
                room = await rooms_collection.find_one({"room_id": slot["room_id"]})
                room_name = room["name"] if room else "Unknown Room"
                
                # Get instructor details
                instructor = await users_collection.find_one({"user_id": slot["instructor_id"]})
                instructor_name = f"{instructor['first_name']} {instructor['last_name']}" if instructor else "TBA"
                
                available_slots.append({
                    "slot_id": slot["slot_id"],
                    "day": slot["day"],
                    "start_time": slot["start_time"].strftime("%H:%M") if hasattr(slot["start_time"], "strftime") else slot["start_time"],
                    "end_time": slot["end_time"].strftime("%H:%M") if hasattr(slot["end_time"], "strftime") else slot["end_time"],
                    "type": slot["type"],
                    "room_id": slot["room_id"],
                    "room_name": room_name, 
                    "instructor_id": slot["instructor_id"],
                    "instructor_name": instructor_name,
                    "available_seats": seats_available
                })
        
        return {
            "course_id": course_id,
            "course_name": course["name"],
            "course_code": course["code"],
            "available_slots": available_slots
        }
    except Exception as e:
        logger.error(f"Error in get_available_slots: {str(e)}")
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")

# Add endpoint for modifying a student's schedule (add or remove a timeslot)
@router.post("/schedule/modify/{student_id}")
async def modify_student_schedule(
    student_id: str,
    course_id: str,
    slot_id: str,
    action: str,  # "add" or "remove"
    user: dict = Depends(get_current_user)
):
    """Add or remove a timeslot from a student's schedule"""
    
    # Handle both dictionary access and object attribute access for user role
    try:
        user_role = user["role"]
        user_id = user["user_id"]
    except (KeyError, TypeError):
        # Try object attribute access
        user_role = getattr(user, "role", None)
        user_id = getattr(user, "user_id", None)
    
    # Authorization check
    if user_role != "admin" and user_id != student_id:
        raise HTTPException(status_code=403, detail="Unauthorized to modify this schedule")
    
    # Validate action
    if action not in ["add", "remove"]:
        raise HTTPException(status_code=400, detail="Action must be 'add' or 'remove'")
    
    # Get existing schedule
    schedule = await schedules_collection.find_one({"student_id": student_id, "course_id": course_id})
    
    if action == "add":
        if not schedule:
            # Create new schedule
            new_schedule = Schedule(
                student_id=student_id,
                course_id=course_id,
                selected_slots=[slot_id]
            )
            await schedules_collection.insert_one(new_schedule.model_dump())
        else:
            # Update existing schedule
            if slot_id in schedule.get("selected_slots", []):
                raise HTTPException(status_code=400, detail="This slot is already in the schedule")
            # Check for scheduling conflicts
            conflict = await schedules_collection.find_one({"student_id": student_id, "selected_slots": {"$in": [slot_id]}})
            if conflict:
                conflict_course = await courses_collection.find_one({"course_id": conflict["course_id"]})
                course_name = conflict_course["name"] if conflict_course else "Unknown Course"
                raise HTTPException(status_code=400, detail=f"Time conflict detected with {course_name}")
            # Check seat availability
            course = await courses_collection.find_one({"course_id": course_id})
            if not course:
                raise HTTPException(status_code=404, detail="Course not found")
            seats_available = course.get("available_slots", {}).get(slot_id, 0)
            if seats_available <= 0:
                raise HTTPException(status_code=400, detail="No available seats for this slot")
            # Update schedule
            await schedules_collection.update_one(
                {"student_id": student_id, "course_id": course_id},
                {"$push": {"selected_slots": slot_id}}
            )
            # Reduce seat availability
            await courses_collection.update_one(
                {"course_id": course_id},
                {"$inc": {f"available_slots.{slot_id}": -1}}
            )
        return {"message": f"Slot {slot_id} added to schedule for course {course_id}"}
    
    else:  # action == "remove"
        if not schedule:
            raise HTTPException(status_code=404, detail="Schedule not found")
        
        if slot_id not in schedule.get("selected_slots", []):
            raise HTTPException(status_code=400, detail="This slot is not in the schedule")
        
        # Update schedule
        await schedules_collection.update_one(
            {"student_id": student_id, "course_id": course_id},
            {"$pull": {"selected_slots": slot_id}}
        )
        
        # Check if the schedule is now empty
        updated_schedule = await schedules_collection.find_one({"student_id": student_id, "course_id": course_id})
        if not updated_schedule.get("selected_slots"):
            # Remove empty schedule
            await schedules_collection.delete_one({"student_id": student_id, "course_id": course_id})
            
            # Update enrollment status to "Pending"
            await enrollments_collection.update_one(
                {"student_id": student_id, "course_id": course_id},
                {"$set": {"status": "Pending"}}
            )
        
        # Increase seat availability
        await courses_collection.update_one(
            {"course_id": course_id},
            {"$inc": {f"available_slots.{slot_id}": 1}}
        )
        
        return {"message": f"Slot {slot_id} removed from schedule for course {course_id}"}