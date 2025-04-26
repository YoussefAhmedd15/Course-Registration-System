from motor.motor_asyncio import AsyncIOMotorClient

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