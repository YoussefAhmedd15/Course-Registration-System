from fastapi import APIRouter, HTTPException, Depends
from database import semester_settings_collection
from models.SemesterSettings import SemesterSettings, SemesterUpdate, SemesterType
from helpers.auth import get_current_user

router = APIRouter()

SETTINGS_ID = "semester_settings" # Using a fixed ID for semester settings document

# Get current semester settings
@router.get("/semester/current")
async def get_current_semester():
    """Get the current semester settings"""
    settings = await semester_settings_collection.find_one({"_id": SETTINGS_ID})
    
    if not settings:
        # If not settings exist, create default settings
        default_settings = SemesterSettings(
            current_semester=SemesterType.FALL,
            academic_year="2024-2025",
            start_date="2024-10-01",
            end_date="2025-01-5"
        )
        await semester_settings_collection.insert_one({"_id": SETTINGS_ID, **default_settings.model_dump()})
        return default_settings
    
    # Remove MONGODB _id field
    if "_id" in settings:
        del settings["_id"]
        
    return settings



# Update semester settings
@router.put("/semester/current")
async def update_semester_settings(settings_update: SemesterUpdate, user: dict = Depends(get_current_user)):
    """Update the current semester settings (admin only)"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only administrators can update semester settings")
    
    # Get current settings
    current_settings = await semester_settings_collection.find_one({"_id": SETTINGS_ID})
    
    # Create if doesn't exist
    if not current_settings:
        default_settings = SemesterSettings(
            current_semester=SemesterType.FALL,
            academic_year="2024-2025",
            start_date="2024-09-01",
            end_date="2024-12-15"
        )
        current_settings = {"_id": SETTINGS_ID, **default_settings.model_dump()}
        await semester_settings_collection.insert_one(current_settings)
        
    # Update fields that are provided
    update_data = settings_update.model_dump(exclude_unset=True)
    
    if update_data:
        await semester_settings_collection.update_one(
            {"_id": SETTINGS_ID},
            {"$set": update_data}
        )
        
    # Get updated settings
    updated_settings = await semester_settings_collection.find_one({"_id": SETTINGS_ID})
    
    # Remove MONGODB _id field
    if "_id" in updated_settings:
        del updated_settings["_id"]
        
    return updated_settings