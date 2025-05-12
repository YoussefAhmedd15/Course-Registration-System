from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MONGO_DETAILS = "mongodb+srv://HamsKhaled:YOXMvSlr7J7b5vED@courseregistration.doq7m.mongodb.net/"

client = AsyncIOMotorClient(MONGO_DETAILS)
database = client.Course_Registration

users_collection = database.get_collection("Users")
students_collection = database.get_collection("Student")
instructors_collection = database.get_collection("Instructor")
admins_collection = database.get_collection("Admin")
courses_collection = database.get_collection("Courses")
departments_collection = database.get_collection("Departments")
enrollments_collection = database.get_collection("Enrollments")
schedules_collection = database.get_collection("Schedule")
sessions_collection = database.get_collection("Sessions")
rooms_collection = database.get_collection("Rooms")
time_slots_collection = database.get_collection("TimeSlots")
semester_settings_collection = database.get_collection("SemesterSettings")
majors_collection = database.get_collection("Majors")

# Function to create indexes
async def create_indexes():
    logger.info("Creating database indexes...")
    
    try:
        # Check for duplicate emails before creating unique index
        duplicate_emails = []
        email_counts = {}
        
        # Find duplicate emails
        async for user in users_collection.find({}, {'email': 1}):
            email = user.get('email')
            if email:
                email_counts[email] = email_counts.get(email, 0) + 1
                if email_counts[email] > 1 and email not in duplicate_emails:
                    duplicate_emails.append(email)
        
        # Handle duplicate emails if found
        if duplicate_emails:
            logger.warning(f"Found {len(duplicate_emails)} duplicate email(s): {duplicate_emails}")
            for email in duplicate_emails:
                # Find all documents with this email
                docs_with_email = []
                async for doc in users_collection.find({'email': email}):
                    docs_with_email.append(doc)
                
                # Keep the first document, update others with a unique email
                for i, doc in enumerate(docs_with_email[1:], 1):
                    unique_email = f"{email}.duplicate{i}"
                    logger.info(f"Updating duplicate email {email} to {unique_email}")
                    await users_collection.update_one(
                        {'_id': doc['_id']},
                        {'$set': {'email': unique_email}}
                    )
        
        # Create indexes individually with try/except blocks
        index_results = {"success": [], "failed": []}
        
        # Indexes for users collection
        try:
            await users_collection.create_index("email", unique=True, background=True)
            index_results["success"].append("users.email")
        except Exception as e:
            logger.error(f"Failed to create index users.email: {str(e)}")
            index_results["failed"].append("users.email")
        
        try:
            await users_collection.create_index("student_id", background=True)
            index_results["success"].append("users.student_id")
        except Exception as e:
            logger.error(f"Failed to create index users.student_id: {str(e)}")
            index_results["failed"].append("users.student_id")
        
        try:
            await users_collection.create_index("role", background=True)
            index_results["success"].append("users.role")
        except Exception as e:
            logger.error(f"Failed to create index users.role: {str(e)}")
            index_results["failed"].append("users.role")
        
        # Indexes for courses collection
        try:
            await courses_collection.create_index("course_id", unique=True, background=True)
            index_results["success"].append("courses.course_id")
        except Exception as e:
            logger.error(f"Failed to create index courses.course_id: {str(e)}")
            index_results["failed"].append("courses.course_id")
        
        try:
            await courses_collection.create_index("department_id", background=True)
            index_results["success"].append("courses.department_id")
        except Exception as e:
            logger.error(f"Failed to create index courses.department_id: {str(e)}")
            index_results["failed"].append("courses.department_id")
        
        try:
            await courses_collection.create_index("semesters", background=True)
            index_results["success"].append("courses.semesters")
        except Exception as e:
            logger.error(f"Failed to create index courses.semesters: {str(e)}")
            index_results["failed"].append("courses.semesters")
        
        try:
            await courses_collection.create_index("prerequisites", background=True)
            index_results["success"].append("courses.prerequisites")
        except Exception as e:
            logger.error(f"Failed to create index courses.prerequisites: {str(e)}")
            index_results["failed"].append("courses.prerequisites")
        
        # Indexes for enrollments collection
        try:
            await enrollments_collection.create_index([("student_id", 1), ("course_id", 1)], background=True)
            index_results["success"].append("enrollments.student_id_course_id")
        except Exception as e:
            logger.error(f"Failed to create index enrollments.student_id_course_id: {str(e)}")
            index_results["failed"].append("enrollments.student_id_course_id")
        
        try:
            await enrollments_collection.create_index("status", background=True)
            index_results["success"].append("enrollments.status")
        except Exception as e:
            logger.error(f"Failed to create index enrollments.status: {str(e)}")
            index_results["failed"].append("enrollments.status")
        
        # Indexes for departments collection
        try:
            await departments_collection.create_index("department_id", unique=True, background=True)
            index_results["success"].append("departments.department_id")
        except Exception as e:
            logger.error(f"Failed to create index departments.department_id: {str(e)}")
            index_results["failed"].append("departments.department_id")
        
        # Indexes for rooms collection
        try:
            await rooms_collection.create_index("room_id", unique=True, background=True)
            index_results["success"].append("rooms.room_id")
        except Exception as e:
            logger.error(f"Failed to create index rooms.room_id: {str(e)}")
            index_results["failed"].append("rooms.room_id")
        
        # Log results
        logger.info(f"Successfully created {len(index_results['success'])} indexes: {', '.join(index_results['success'])}")
        if index_results["failed"]:
            logger.warning(f"Failed to create {len(index_results['failed'])} indexes: {', '.join(index_results['failed'])}")
        else:
            logger.info("All database indexes created successfully")
    except Exception as e:
        # Log the error but don't crash the application
        logger.error(f"Error during index creation process: {str(e)}")
        logger.info("The application will continue to run without some indexes")

# Create the startup event handler
async def on_startup():
    try:
        # Create indexes when application starts
        await create_indexes()
        logger.info("Connected to MongoDB!")
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
        # Don't crash the app, log and continue
        logger.warning("Application may have reduced functionality due to database connection issues")

# We don't run this directly, it should be imported and run by the app startup