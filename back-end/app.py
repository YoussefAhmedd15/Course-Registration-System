from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from controllers.userController import router as user_router
from controllers.courseController import router as course_router
from controllers.authController import router as auth_router
from controllers.enrollmentController import router as enrollment_router
from controllers.scheduleController import router as scheduleRouter
from controllers.departmentController import router as departmentRouter
from controllers.roomController import router as roomsRouter
from controllers.AdminTimeSlots import router as timeSlotsRouter
from controllers.CourseTreeController import router as course_tree_router
from controllers.semesterController import router as semester_router
from controllers.majorsController import router as majors_router
from database import database, on_startup as init_db

app = FastAPI(
    title="Course Registration System API",
    description="API for a university course registration system",
    version="1.0.0",
    on_startup=[init_db]
)

app.include_router(user_router, prefix="/api/v1", tags=["Users"])
app.include_router(course_router, prefix="/api/v1", tags=["Courses"])
app.include_router(auth_router, prefix="/api", tags=["Authentication"])
app.include_router(enrollment_router, prefix="/api/v1", tags=["Enrollments"])
app.include_router(scheduleRouter, prefix="/api/v1", tags=["Schedule"])
app.include_router(departmentRouter, prefix="/api/v1", tags=["Department"])
app.include_router(course_tree_router, prefix="/api/v1", tags=["Course Tree"])
app.include_router(roomsRouter, prefix="/api/v1", tags=["Rooms"])
app.include_router(timeSlotsRouter, prefix="/api/v1", tags=["Time-Slots"])
app.include_router(semester_router,prefix="/api/v1", tags=["Semester-Router"])
app.include_router(majors_router, prefix="/api/v1", tags=["Majors"])


origins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    # For development - remove in production
    "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development only - allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Test database endpoint
@app.get("/test-database")
async def test_database():
    collections = await database.list_collection_names()
    return {"collections": collections}