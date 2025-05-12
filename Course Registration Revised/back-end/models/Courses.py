from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class Course(BaseModel):
    course_id: Optional[str] = None
    name: str = Field(..., min_length=3, max_length=100)
    description: str = Field(..., min_length=10, max_length=500)
    credit_hours: int = Field(..., gt=0, le=4)
    department_id: str
    prerequisites: Optional[List[str]] = []
    children: Optional[List[Dict[str, Any]]] = []
    semesters: Optional[List[str]] = []  # Fall, Spring, Summer
    level: Optional[int] = Field(None, ge=1, le=4)  # Level 1-4

class CourseUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=3, max_length=100)
    description: Optional[str] = Field(None, min_length=10, max_length=500)
    credit_hours: Optional[int] = Field(None, gt=0, le=4)
    department_id: Optional[str] = None
    prerequisites: Optional[List[str]] = None
    children: Optional[List[Dict[str, Any]]] = []
    semesters: Optional[List[str]] = []  # Fall, Spring, Summer
    level: Optional[int] = Field(None, ge=1, le=4)  # Level 1-4