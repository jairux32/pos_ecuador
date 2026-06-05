from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone
from bson import ObjectId
import re

from database import db
from auth import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    get_current_user, get_jwt_secret, JWT_ALGORITHM
)
import jwt

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    business_id: str = None


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


def validate_password_strength(password: str) -> bool:
    if len(password) < 8:
        return False
    if not re.search(r'[A-Z]', password):
        return False
    if not re.search(r'[a-z]', password):
        return False
    if not re.search(r'[0-9]', password):
        return False
    return True


async def check_brute_force(identifier: str):
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("count", 0) >= 5:
        lockout_until = attempt.get("lockout_until")
        if lockout_until and datetime.now(timezone.utc) < lockout_until:
            raise HTTPException(status_code=429, detail="Demasiados intentos. Intente en 15 minutos.")
        else:
            await db.login_attempts.delete_one({"identifier": identifier})


async def record_failed_attempt(identifier: str):
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt:
        new_count = attempt.get("count", 0) + 1
        update = {"$set": {"count": new_count, "last_attempt": datetime.now(timezone.utc)}}
        if new_count >= 5:
            from datetime import timedelta
            update["$set"]["lockout_until"] = datetime.now(timezone.utc) + timedelta(minutes=15)
        await db.login_attempts.update_one({"identifier": identifier}, update)
    else:
        await db.login_attempts.insert_one({
            "identifier": identifier,
            "count": 1,
            "last_attempt": datetime.now(timezone.utc)
        })


@router.post("/login")
async def login(request: Request, body: LoginRequest, response: Response):
    email = body.email.strip().lower()
    client_ip = request.client.host if request.client else "unknown"
    identifier = f"{client_ip}:{email}"
    await check_brute_force(identifier)

    user = await db.users.find_one({"email": email})
    if not user:
        await record_failed_attempt(identifier)
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    if not verify_password(body.password, user["password_hash"]):
        await record_failed_attempt(identifier)
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    await db.login_attempts.delete_one({"identifier": identifier})

    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)

    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")

    user_data = {
        "id": user_id,
        "email": user["email"],
        "name": user.get("name", ""),
        "role": user.get("role", "vendedor"),
        "business_id": user.get("business_id"),
        "branch_ids": user.get("branch_ids", []),
    }
    return user_data


@router.post("/register")
async def register(body: RegisterRequest, response: Response):
    email = body.email.strip().lower()
    if not validate_password_strength(body.password):
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número")

    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="El email ya está registrado")

    hashed = hash_password(body.password)
    user_doc = {
        "email": email,
        "password_hash": hashed,
        "name": body.name,
        "role": "superadmin",
        "business_id": body.business_id,
        "branch_ids": [],
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)

    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)

    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")

    return {
        "id": user_id,
        "email": email,
        "name": body.name,
        "role": "superadmin",
        "business_id": body.business_id,
        "branch_ids": [],
    }


@router.get("/me")
async def me(request: Request):
    user = await get_current_user(request)
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user.get("name", ""),
        "role": user.get("role", "vendedor"),
        "business_id": user.get("business_id"),
        "branch_ids": user.get("branch_ids", []),
    }


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Sesión cerrada"}


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No hay token de refresco")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Token inválido")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        user_id = str(user["_id"])
        new_access = create_access_token(user_id, user["email"])
        response.set_cookie(key="access_token", value=new_access, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
        return {"message": "Token renovado"}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token de refresco expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")
