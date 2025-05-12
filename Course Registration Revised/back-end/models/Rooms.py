from pydantic import BaseModel, Field
from typing import Optional

class Room(BaseModel):
    room_id: Optional[str] = None
    building: str = Field(..., min_length=1, max_length=1, pattern="^[A-Z]$")
    room_number: int = Field(..., ge=1, le=999)
    capacity: int = Field(..., ge=1)
    type: str = Field(..., min_length=3, max_length=50) #Lecture hall, lab
    
class RoomUpdate(BaseModel):
    building: Optional[str] = None
    room_number: Optional[int] = None
    capacity: Optional[str] = None
    type: Optional[str] = None