from fastapi import APIRouter, Depends, HTTPException
from models.Schedules import Schedule
from database import schedules_collection, courses_collection, enrollments_collection
from helpers.auth import get_current_user

router = APIRouter()

@router.post("/schedule/")
async def create_schedule(schedule: Schedule, user: dict = Depends(get_current_user)):
    """Handles scheduling process (time slot selection & conflicts)"""
    
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Only students can create schedules")
    
    student_id = user["user_id"]
    
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
            raise HTTPException(status_code=400, detail=f"{session} is requierd for {course["name"]}")
        
    #Check for scheduling conflicts
    for slot in schedule.selected_slots:
        conflict = await schedules_collection.find_one({"student_id": student_id, "selected_slots": {"$in": [slot]}})
        if conflict:
            raise HTTPException(status_code=400, detail=f"Time conflict detected for {slot}")
        
    
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
    
    return {"message": "Schedule created successfully "}

#Reset the schedule (remove time slots while keeping enrollments intact)
@router.delete("/admin/reset-schedule/{student_id}")
async def reset_student_schedule(student_id: str, user: dict = Depends(get_current_user)):
    """Allows schedule reset"""
    
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Only students can resset schedules")
    
    #Find student's schedule
    schedules = await schedules_collection.find({"student_id": student_id}).to_list(None)
    if not schedules:
        raise HTTPException(status_code=404, detail="No schedule found for this student")
    
    #Restore seat availability
    for schedule in schedules:
        for slot in schedule["selected_slots"]:
            await courses_collection.update_one({
                {"course_id": schedule["course_id"]}, {"$inc": {f"available_slots.{slot}": 1}}
            })
            
    #Remove all schedules for this student
    await schedules_collection.delete_many({"student_id": student_id})
    
    return {"message": f"Schedule for student {student_id} has been reset"}

#View student schedule
router.get("/schedule/{student_id}")
async def get_student_schedule(student_id: str, user: dict = Depends(get_current_user)):
    """Retrieve a student's schedule"""
    
    if user["role"] not in ["student", "instructor"]:
        raise HTTPException(status_code=403, detail="Only students and instructors can view schedules")
    
    #Ensure student is viewing their own schedule (unless admin)
    if user["role"] == "student" and user["user_id"] != student_id:
        raise HTTPException(status_code=403, detail="Unauthorized access to this schedule")
    
    #Get schedule details
    schedule = await schedules_collection.find({"student_id": student_id}).to_list(None)
    if not schedule:
        raise HTTPException(status_code=404, detail="No schedule found")
    
    return {"student_id": student_id, "schedule": schedule}