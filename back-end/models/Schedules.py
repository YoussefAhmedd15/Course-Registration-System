from pydantic import BaseModel, Field
from typing import List
from datetime import datetime, timezone
from models.Enrollments import get_utc_now

class Schedule(BaseModel):
    student_id: str
    course_id: str
    selected_slots: List[str] #Slots assigned (Lecture/Lab/Tutorial)
    created_at: datetime = Field(default_factory=get_utc_now)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
    

class TimeSlot(BaseModel):
    course_id: str
    slot_id: str
    slot_type: str = Field(..., pattern="^(Lecture|Lab|Tutorial)$")
    available_seats: int