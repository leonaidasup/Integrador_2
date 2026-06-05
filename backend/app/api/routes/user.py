from __future__ import annotations

from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, status, Header
from app.core.supabase_client import get_supabase_client

router = APIRouter(prefix="/user", tags=["user"])


class UserProfile(BaseModel):
    name: str
    email: str
    role: str = ""
    bio: str = ""


class UserProfileResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    bio: str = ""


def get_user_id_from_token(authorization: Optional[str] = Header(None)) -> str:
    """Extract user_id from Authorization header token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    
    token = authorization.replace("Bearer ", "")
    try:
        client = get_supabase_client()
        user = client.auth.get_user(token)
        return user.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


@router.get("/profile", response_model=UserProfileResponse)
def get_profile(user_id: str = Header(None, alias="x-user-id")):
    """Get current user profile."""
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not provided")
    
    try:
        client = get_supabase_client()
        user = client.table("users").select("*").eq("id", user_id).single().execute()
        
        if not user.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )
        
        data = user.data
        return UserProfileResponse(
            id=data.get("id", ""),
            name=data.get("name", ""),
            email=data.get("email", ""),
            role=data.get("role", ""),
            bio=data.get("bio", ""),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch user profile",
        ) from exc


@router.put("/profile", response_model=UserProfileResponse)
def update_profile(profile: UserProfile, user_id: str = Header(None, alias="x-user-id")):
    """Update current user profile."""
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not provided")
    
    try:
        client = get_supabase_client()
        
        # Update user data in database
        updated = client.table("users").update({
            "name": profile.name,
            "email": profile.email,
            "role": profile.role,
            "bio": profile.bio,
        }).eq("id", user_id).execute()
        
        if not updated.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )
        
        data = updated.data[0]
        return UserProfileResponse(
            id=data.get("id", ""),
            name=data.get("name", ""),
            email=data.get("email", ""),
            role=data.get("role", ""),
            bio=data.get("bio", ""),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
