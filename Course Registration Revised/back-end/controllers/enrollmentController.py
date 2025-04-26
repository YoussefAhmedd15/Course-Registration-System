from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from models.Enrollments import (
    EnrollmentCreate,
    Enrollment,
    EnrollmentResponse,
    EnrollmentStatus,
    CourseAvailabilityResponse
)
from database import (
    enrollments_collection,
    students_collection,
    courses_collection,
    users_collection,
    departments_collection,
    semester_settings_collection
)
from helpers.auth import get_current_user
from helpers.exceptions import EnrollmentError
from models.SemesterSettings import SemesterType

router = APIRouter()

WITHDRAWAL_DEADLINE_DAYS = 14
SETTINGS_ID = "semester_settings"  # Same as in semesterController

async def get_current_semester() -> SemesterType:
    """Helper function to get the current semester"""
    settings = await semester_settings_collection.find_one({"_id": SETTINGS_ID})
    
    if not settings:
        # If no settings exist, default to Fall
        return SemesterType.FALL
    
    return settings.get("current_semester", SemesterType.FALL)

async def validate_prerequisites(student_id: str, course_id: str) -> tuple[bool, str]:
    """
    Check if student has completed all prerequisites for a course
    Returns: (prerequisites_met, error_message)
    """
    course = await courses_collection.find_one({"course_id": course_id})
    if not course or not course.get("prerequisites"):
        return True, ""
    
    # Get student's completed courses
    completed_courses = await enrollments_collection.find({
        "student_id": student_id,
        "status": EnrollmentStatus.COMPLETED
    }).to_list(None)
    
    completed_course_ids = {enrollment["course_id"] for enrollment in completed_courses}
    missing_prerequisites = [
        prereq for prereq in course["prerequisites"]
        if prereq not in completed_course_ids
    ]
    
    if missing_prerequisites:
        # Get course names for better error message
        prereq_courses = await courses_collection.find(
            {"course_id": {"$in": missing_prerequisites}}
        ).to_list(None)
        prereq_names = [f"{c['course_id']} ({c['name']})" for c in prereq_courses]
        return False, f"Missing prerequisites: {', '.join(prereq_names)}"
    
    return True, ""

async def validate_enrollment(student_id: str, course_id: str):
    """Validate enrollment requirements"""
    print(f"Validating enrollment for student_id: {student_id} (type: {type(student_id)})")
    # Check if student exists
    student = await users_collection.find_one({"student_id": student_id.strip()})
    print(f"DEBUG: Retrieved student: {student}")
    if not student:
        raise EnrollmentError("Student not found")
    
    # Check if course exists
    course = await courses_collection.find_one({"course_id": course_id})
    if not course:
        raise EnrollmentError("Course not found")
    
    # Check prerequisites
    prereqs_met, error_message = await validate_prerequisites(student_id, course_id)
    if not prereqs_met:
        raise EnrollmentError(error_message)
    
    # Check credit hours
    if student["credit_hours"] < course["credit_hours"]:
        raise EnrollmentError(
            f"Insufficient credit hours. Required: {course['credit_hours']}, Available: {student['credit_hours']}"
        )
    
    # Check existing enrollment
    existing = await enrollments_collection.find_one({
        "student_id": student_id,
        "course_id": course_id,
        "status": {"$in": [EnrollmentStatus.PENDING, EnrollmentStatus.COMPLETED]}
    })
    existing_enrollment = await enrollments_collection.find_one({
    "student_id": student_id.strip(),
    "course_id": course_id.strip()
    })
    print(f"DEBUG: Checking enrollment for student_id: '{student_id}', course_id: '{course_id}'")
    print(f"DEBUG: Found existing enrollment: {existing_enrollment}")
    if existing:
        raise EnrollmentError("Already enrolled in this course")
    
    # Check if course is offered in current semester
    current_semester = await get_current_semester()
    if not course.get("semesters") or current_semester not in course.get("semesters", []):
        raise EnrollmentError(f"Course not offered in the current {current_semester} semester")
    
    return student, course

async def get_course_tree_flattened():
    """
    Get a flattened list of all courses in the course tree
    Returns: Set of course_ids present in the course tree
    """
    # This helper function extracts all course IDs from the tree structure
    def extract_course_ids(nodes):
        course_ids = set()
        for node in nodes:
            course_ids.add(node["course_id"])
            if node.get("children"):
                course_ids.update(extract_course_ids(node["children"]))
        return course_ids
    
    try:
        # Build query to get all courses in the tree
        query = {}
        
        # Get all courses based on query
        courses = await courses_collection.find(query).to_list(1000)
        
        # Create a dictionary to store all courses by their ID for easy lookup
        course_dict = {course["course_id"]: course for course in courses}
        
        # Build the tree structure
        root_nodes = []
        processed_courses = set()
        
        # First pass: identify root nodes (courses without prerequisites)
        for course_id, course in course_dict.items():
            # If course has no prerequisites or prerequisites are empty, it's a root node
            if not course.get("prerequisites") or len(course["prerequisites"]) == 0:
                root_data = {
                    "course_id": course["course_id"],
                    "name": course["name"],
                    "children": [],
                }
                root_nodes.append(root_data)
                processed_courses.add(course_id)
        
        # Function to recursively build the tree
        def build_children(parent_id):
            children = []
            for course_id, course in course_dict.items():
                if course_id not in processed_courses and course.get("prerequisites") and parent_id in course["prerequisites"]:
                    child_data = {
                        "course_id": course["course_id"],
                        "name": course["name"],
                        "children": [],
                    }
                    processed_courses.add(course_id)
                    child_data["children"] = build_children(course_id)
                    children.append(child_data)
            return children
        
        # Build the tree for each root node
        for root in root_nodes:
            root["children"] = build_children(root["course_id"])
        
        # Extract all course IDs from the tree
        all_tree_courses = extract_course_ids(root_nodes)
        
        # Add any courses not yet processed (might be isolated nodes)
        for course_id in course_dict:
            all_tree_courses.add(course_id)
        
        return all_tree_courses
        
    except Exception as e:
        print(f"Error getting course tree: {str(e)}")
        return set()  # Return empty set on error

@router.get("/courses/available", response_model=List[CourseAvailabilityResponse])
async def get_available_courses(
    user: dict = Depends(get_current_user),
    semester: Optional[str] = None  # Optional parameter to override current semester
):
    """
    Get all courses available for enrollment for the current student,
    checking prerequisites and existing enrollments.
    Only courses that are in the course tree and offered in the current semester will be returned.
    """
    if user["role"] != "student":
        raise HTTPException(
            status_code=403,
            detail="Only students can view available courses"
        )
    
    student_id = str(user["user_id"])
    
    # Get current semester if not specified
    current_semester = semester or await get_current_semester()
    
    # Get all courses in the course tree
    course_tree_ids = await get_course_tree_flattened()
    
    # Get all courses that are in the course tree and offered in the current semester
    courses = await courses_collection.find(
        {
            "course_id": {"$in": list(course_tree_ids)},
            "semesters": current_semester
        }
    ).to_list(None)
    
    # Get student's completed and current courses
    student_enrollments = await enrollments_collection.find({
        "student_id": student_id,
        "status": {"$in": [EnrollmentStatus.PENDING, EnrollmentStatus.COMPLETED]}
    }).to_list(None)
    
    enrolled_courses = {e["course_id"] for e in student_enrollments}
    completed_courses = {
        e["course_id"] for e in student_enrollments 
        if e["status"] == EnrollmentStatus.COMPLETED
    }
    
    # Check each course
    available_courses = []
    for course in courses:
        # Get department name
        department = await departments_collection.find_one(
            {"department_id": course.get("department_id")}
        )
        department_name = department["name"] if department else "Unknown"
        
        # Default response
        course_response = CourseAvailabilityResponse(
            course_id=course["course_id"],
            name=course["name"],
            description=course.get("description", ""),
            credit_hours=course["credit_hours"],
            department_name=department_name,
            prerequisites=course.get("prerequisites", []),
            can_enroll=True,
            reason=None
        )
        
        # Check if already enrolled
        if course["course_id"] in enrolled_courses:
            course_response.can_enroll = False
            course_response.reason = "Already enrolled"
            available_courses.append(course_response)
            continue
        
        # Check prerequisites
        if course.get("prerequisites"):
            missing_prereqs = [
                prereq for prereq in course["prerequisites"]
                if prereq not in completed_courses
            ]
            if missing_prereqs:
                course_response.can_enroll = False
                course_response.reason = f"Missing prerequisites: {', '.join(missing_prereqs)}"
                available_courses.append(course_response)
                continue
        
        available_courses.append(course_response)
    
    return available_courses

@router.post("/enrollments/", response_model=EnrollmentResponse)
async def register_course(
    enrollment: EnrollmentCreate,
    user: dict = Depends(get_current_user)
):
    """Register a student for a course"""
    try:
        # Verify student authorization
        if user["role"] not in ["student", "instructor"]:
            raise HTTPException(
                status_code=403,
                detail="Only students can register for courses"
            )
        
        if str(user["user_id"]) != str(enrollment.student_id):
            raise HTTPException(
                status_code=403,
                detail="Unauthorized to register for this student ID"
            )
        
        # Verify course is in the course tree
        course_tree_ids = await get_course_tree_flattened()
        if enrollment.course_id not in course_tree_ids:
            raise HTTPException(
                status_code=400,
                detail="Course is not available for enrollment"
            )
        
        enrollment_student_id = str(enrollment.student_id)
        # Validate enrollment requirements
        student, course = await validate_enrollment(
            enrollment_student_id,
            enrollment.course_id
        )
        
        # Create enrollment record
        now = datetime.now(timezone.utc)
        enrollment_data = Enrollment(
            student_id=enrollment.student_id,
            course_id=enrollment.course_id,
            registered_at=now,
            status=EnrollmentStatus.PENDING,
            created_at=now,
            last_updated=now
        ).model_dump()
        
        # Insert enrollment
        await enrollments_collection.insert_one(enrollment_data)
        
        # Update student's credit hours
        await students_collection.update_one(
            {"student_id": student["student_id"]},
            {"$inc": {"credit_hours": -course["credit_hours"]}}
        )
        
        # Get department name for response
        department = await departments_collection.find_one(
            {"department_id": course.get("department_id")}
        )
        
        # Prepare response
        return EnrollmentResponse(
            student_id=enrollment.student_id,
            course_id=enrollment.course_id,
            course_name=course["name"],
            credit_hours=course["credit_hours"],
            status=EnrollmentStatus.PENDING,
            registered_at=now
        )
        
    except EnrollmentError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/enrollments/{course_id}")
async def withdraw_course(
    course_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Withdraw from a course

    Args:
        course_id (str): CourseID to withdraw from
        user (dict, optional): Current authenticated user
        
    Returns:
        dict: Success message
        
    Raises:
        HTTPException: for various validation errors
    """
    try:
        if user["role"] != "student":
            raise HTTPException(
                status_code=403,
                detail="Only students can withdraw from courses"
            )
        
        student_id = str(user["user_id"])
        
        # Check enrollment exists
        enrollment = await enrollments_collection.find_one({
            "student_id": student_id,
            "course_id": course_id
        })
        if not enrollment:
            raise HTTPException(
                status_code=404,
                detail="Enrollment not found"
            )
        
        # Check withdrawal deadline - Fix timezone issue
        registered_at = enrollment["registered_at"]
        # Ensure registered_at has timezone info
        if registered_at.tzinfo is None:
            # If naive, assume it's UTC and make it timezone-aware
            registered_at = registered_at.replace(tzinfo=timezone.utc)
            
        if (datetime.now(timezone.utc) - registered_at >
            timedelta(days=WITHDRAWAL_DEADLINE_DAYS)):
            raise HTTPException(
                status_code=400,
                detail="Withdrawal deadline has passed"
            )
            
        # Get course details
        course = await courses_collection.find_one({"course_id": course_id})
        if not course:
            raise HTTPException(
                status_code=404,
                detail="Course not found"
            )

        # Process withdrawal
        try:
            async with await enrollments_collection.database.client.start_session() as session:
                async with session.start_transaction():
                    # Update enrollment status
                    await enrollments_collection.update_one(
                        {"student_id": student_id, "course_id": course_id},
                        {"$set": {
                            "status": EnrollmentStatus.WITHDRAWN,
                            "last_updated": datetime.now(timezone.utc)
                        }},
                        session=session
                    )
            
                    # Restore credit hours
                    await students_collection.update_one(
                        {"student_id": student_id},
                        {"$inc": {"credit_hours": course["credit_hours"]}},
                        session=session
                    )
        except AttributeError:
            # If start_session is not available, fall back to non-transactional updates
            # Update enrollment status
            await enrollments_collection.update_one(
                {"student_id": student_id, "course_id": course_id},
                {"$set": {
                    "status": EnrollmentStatus.WITHDRAWN,
                    "last_updated": datetime.now(timezone.utc)
                }}
            )
        
            # Restore credit hours
            await students_collection.update_one(
                {"student_id": student_id},
                {"$inc": {"credit_hours": course["credit_hours"]}}
            )
            
        return {
            "message": f"Successfully withdrawn from {course_id}",
            "status": EnrollmentStatus.WITHDRAWN
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/enrollments/student/{student_id}", response_model=List[EnrollmentResponse])
async def get_student_enrollments(
    student_id: str,
    user: dict = Depends(get_current_user)
):
    """Get all enrollments for a student"""
    if user["role"] not in ["student", "instructor", "admin"] or (
        user["role"] == "student" and str(user["user_id"]) != str(student_id)
    ):
        raise HTTPException(
            status_code=403,
            detail="Unauthorized access to view these enrollments"
        )
    
    # Get all courses in the course tree
    course_tree_ids = await get_course_tree_flattened()
    
    enrollments = await enrollments_collection.find({
        "student_id": student_id,
        "course_id": {"$in": list(course_tree_ids)}
    }).to_list(None)
    
    response_enrollments = []
    for enrollment in enrollments:
        course = await courses_collection.find_one({"course_id": enrollment["course_id"]})
        if course:
            response_enrollments.append(
                EnrollmentResponse(
                    student_id=enrollment["student_id"],
                    course_id=enrollment["course_id"],
                    course_name=course["name"],
                    credit_hours=course["credit_hours"],
                    status=enrollment["status"],
                    registered_at=enrollment["registered_at"]
                )
            )
            
    return response_enrollments

@router.get("/courses/tree/available")
async def get_available_course_tree(
    user: dict = Depends(get_current_user),
    semester: Optional[str] = None  # Optional parameter to override current semester
):
    """
    Get available courses structured as a tree,
    showing prerequisites and subsequent courses.
    Only returns courses that the student can enroll in for the current semester.
    """
    if user["role"] != "student":
        raise HTTPException(
            status_code=403,
            detail="Only students can view available courses"
        )
    
    student_id = str(user["user_id"])
    
    # Get current semester if not specified
    current_semester = semester or await get_current_semester()
    
    # Get student's completed and current courses
    student_enrollments = await enrollments_collection.find({
        "student_id": student_id,
        "status": {"$in": [EnrollmentStatus.PENDING, EnrollmentStatus.COMPLETED]}
    }).to_list(None)
    
    enrolled_courses = {e["course_id"] for e in student_enrollments}
    completed_courses = {
        e["course_id"] for e in student_enrollments 
        if e["status"] == EnrollmentStatus.COMPLETED
    }
    
    # Get all courses in the course tree
    course_tree_ids = await get_course_tree_flattened()
    
    # Build query based on filters - add semester filter
    query = {
        "course_id": {"$in": list(course_tree_ids)},
        "semesters": current_semester  # Only include courses offered in current semester
    }
    
    # Get all courses based on query
    courses = await courses_collection.find(query).to_list(1000)
    
    # Create a dictionary to store all courses by their ID for easy lookup
    course_dict = {course["course_id"]: course for course in courses}
    
    # Add department names and enrollment status to each course
    for course_id, course in course_dict.items():
        if course.get("department_id"):
            department = await departments_collection.find_one(
                {"department_id": course["department_id"]},
                {"name": 1, "_id": 0}
            )
            course["department_name"] = department["name"] if department else "Unknown"
        
        # Check enrollment status
        if course_id in enrolled_courses:
            course["can_enroll"] = False
            course["enrollment_status"] = "enrolled"
        elif course_id in completed_courses:
            course["can_enroll"] = False
            course["enrollment_status"] = "completed"
        else:
            # Check prerequisites
            if course.get("prerequisites"):
                missing_prereqs = [
                    prereq for prereq in course["prerequisites"]
                    if prereq not in completed_courses
                ]
                if missing_prereqs:
                    course["can_enroll"] = False
                    course["enrollment_status"] = "prerequisites_missing"
                else:
                    course["can_enroll"] = True
                    course["enrollment_status"] = "available"
            else:
                course["can_enroll"] = True
                course["enrollment_status"] = "available"
    
    # Build the tree structure - only include roots and their children
    root_nodes = []
    processed_courses = set()
    
    # First pass: identify root nodes (courses without prerequisites)
    for course_id, course in course_dict.items():
        # If course has no prerequisites or prerequisites are empty, it's a root node
        if not course.get("prerequisites") or len(course["prerequisites"]) == 0:
            root_data = {
                "course_id": course["course_id"],
                "name": course["name"],
                "department_id": course.get("department_id", ""),
                "department_name": course.get("department_name", "Unknown"),
                "credit_hours": course["credit_hours"],
                "can_enroll": course.get("can_enroll", False),
                "enrollment_status": course.get("enrollment_status", "unknown"),
                "description": course.get("description", ""),
                "children": [],
                "semesters": course.get("semesters", []),
                "current_semester": current_semester
            }
            root_nodes.append(root_data)
            processed_courses.add(course_id)
    
    # Function to recursively build the tree
    def build_children(parent_id):
        children = []
        for course_id, course in course_dict.items():
            if course_id not in processed_courses and course.get("prerequisites") and parent_id in course["prerequisites"]:
                child_data = {
                    "course_id": course["course_id"],
                    "name": course["name"],
                    "department_id": course.get("department_id", ""),
                    "department_name": course.get("department_name", "Unknown"),
                    "credit_hours": course["credit_hours"],
                    "can_enroll": course.get("can_enroll", False),
                    "enrollment_status": course.get("enrollment_status", "unknown"),
                    "description": course.get("description", ""),
                    "prerequisites": course.get("prerequisites", []),
                    "children": [],
                    "semesters": course.get("semesters", []),
                    "current_semester": current_semester
                }
                processed_courses.add(course_id)
                child_data["children"] = build_children(course_id)
                children.append(child_data)
        return children
    
    # Build the tree for each root node
    for root in root_nodes:
        root["children"] = build_children(root["course_id"])
    
    # Group by department
    departments = {}
    for course in root_nodes:
        dept_id = course["department_id"]
        dept_name = course["department_name"]
        
        if dept_id not in departments:
            departments[dept_id] = {
                "department_id": dept_id,
                "department_name": dept_name,
                "courses": [],
                "current_semester": current_semester
            }
        
        departments[dept_id]["courses"].append(course)
    
    # Convert to list for response
    result = list(departments.values())
    
    return result

