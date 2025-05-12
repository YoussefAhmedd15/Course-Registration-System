from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordRequestForm
from database import users_collection
from helpers.auth import verify_password, create_access_token

router = APIRouter()

@router.post("/auth/login")
async def login_user(form_data: OAuth2PasswordRequestForm = Depends()):
    """Authenticates user and return JWT token"""
    user = await users_collection.find_one({"email": form_data.username})
    if not user or not verify_password(form_data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    role = "student" if "student_id" in user else "instructor" if "instructor_id" in user else "admin"
    user_id = user.get(f"{role}_id") if role != "admin" else str(user["_id"])

    print(f"Role: {role}, User ID: {user_id}")
    
    token_data = {
        "sub": user["email"],
        "role": role,
        "user_id": user_id
    }
    
    access_token = create_access_token(token_data)
    return {"access_token": access_token, "token_type":"bearer"}