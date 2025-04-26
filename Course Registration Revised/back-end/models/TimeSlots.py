from pydantic import BaseModel, Field
from typing import Optional
from datetime import time
from datetime import datetime

class TimeSlot(BaseModel):
    slot_id: Optional[str] = None
    room_id: str
    day: str = Field(..., pattern="^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$")
    start_time: time
    end_time: time
    type: str = Field(..., pattern="^(Lab|Lecture|Tutorial)$")
    instructor_id: Optional[str] = None
    course_id: Optional[str] = None

    @classmethod
    def validate_time(cls, v):
        if isinstance(v, str):
            return datetime.strptime(v, "%H:%M:%S").time()
        return v