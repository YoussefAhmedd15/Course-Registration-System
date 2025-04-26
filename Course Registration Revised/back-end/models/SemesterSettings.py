from pydantic import BaseModel
from typing import Optional, List
from enum import Enum

class SemesterType(str, Enum):
    FALL = "Fall"
    SPRING = "Spring"
    SUMMER = "Summer"
    
class SemesterSettings(BaseModel):
    """Model for storing current semester settings"""
    current_semester: SemesterType
    academic_year: str
    start_date: str
    end_date: str
    
class SemesterUpdate(BaseModel):
    """Model for updating semester settings"""
    current_semester: Optional[SemesterType] = None
    academic_year: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None