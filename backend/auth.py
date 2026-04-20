from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field

from settings import get_settings
from supabase_client import get_supabase_client

router = APIRouter()
security = HTTPBearer(auto_error=False)


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    role: Literal["user", "admin"]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)


class UserResponse(BaseModel):
    id: str
    name: str
    email: EmailStr
    role: Literal["user", "admin"]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


def _hash_password(password: str) -> str:
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
    return hashed.decode("utf-8")


def _verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def _get_user_by_email(email: str) -> Optional[dict]:
    client = get_supabase_client()
    response = (
        client.table("users")
        .select("id,name,role,email,password_hash")
        .eq("email", email)
        .limit(1)
        .execute()
    )
    if response.data:
        return _normalize_user(response.data[0])
    return None


def _get_user_by_id(user_id: str) -> Optional[dict]:
    client = get_supabase_client()
    response = (
        client.table("users")
        .select("id,name,role,email")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if response.data:
        return _normalize_user(response.data[0])
    return None


def _normalize_user(user: dict) -> dict:
    normalized = dict(user)
    if "id" in normalized and normalized["id"] is not None:
        normalized["id"] = str(normalized["id"])
    return normalized


def _create_access_token(user: dict) -> str:
    settings = get_settings()
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_exp_minutes)
    payload = {
        "sub": str(user["id"]),
        "email": user["email"],
        "role": user["role"],
        "name": user["name"],
        "exp": expires,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _decode_token(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired.",
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token.",
        ) from exc


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> UserResponse:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header.",
        )

    scheme = credentials.scheme
    token = credentials.credentials
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization header.",
        )

    payload = _decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload.",
        )

    user = _get_user_by_id(str(user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )

    return UserResponse(**user)


@router.post("/auth/register", response_model=UserResponse, status_code=201)
def register(payload: RegisterRequest) -> UserResponse:
    try:
        existing = _get_user_by_email(payload.email)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while checking user.",
        ) from exc

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered.",
        )

    user_data = {
        "name": payload.name.strip(),
        "email": payload.email.lower(),
        "role": payload.role,
        "password_hash": _hash_password(payload.password),
    }

    try:
        response = get_supabase_client().table("users").insert(user_data).execute()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while creating user.",
        ) from exc

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User creation failed.",
        )

    created = response.data[0]
    return UserResponse(**_normalize_user(created))


@router.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest) -> TokenResponse:
    try:
        user = _get_user_by_email(payload.email)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while loading user.",
        ) from exc

    if not user or not _verify_password(payload.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    token = _create_access_token(user)
    return TokenResponse(access_token=token)


@router.get("/auth/me", response_model=UserResponse)
def me(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    return current_user
