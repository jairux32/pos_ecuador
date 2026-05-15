from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId
import uuid

from database import db
from auth import get_current_user, hash_password

router = APIRouter(prefix="/api/users", tags=["users"])

VALID_ROLES = ["superadmin", "administrador", "vendedor", "bodeguero", "contador"]


class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    role: str = "vendedor"
    branch_ids: List[str] = []


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    branch_ids: Optional[List[str]] = None
    is_active: Optional[bool] = None


@router.get("/")
async def get_users(request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["superadmin", "administrador"]:
        raise HTTPException(status_code=403, detail="No tiene permisos")

    users = await db.users.find(
        {"business_id": user["business_id"]},
        {"password_hash": 0}
    ).to_list(500)

    for u in users:
        u["id"] = str(u.pop("_id"))

    return {"users": users}


@router.post("/")
async def create_user(body: UserCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["superadmin", "administrador"]:
        raise HTTPException(status_code=403, detail="No tiene permisos para crear usuarios")

    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Rol inválido. Roles válidos: {', '.join(VALID_ROLES)}")

    email = body.email.strip().lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="El email ya está registrado")

    hashed = hash_password(body.password)
    user_doc = {
        "email": email,
        "password_hash": hashed,
        "name": body.name,
        "role": body.role,
        "business_id": user["business_id"],
        "branch_ids": body.branch_ids,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(user_doc)

    return {
        "id": str(result.inserted_id),
        "email": email,
        "name": body.name,
        "role": body.role,
        "branch_ids": body.branch_ids,
        "is_active": True
    }


@router.put("/{user_id}")
async def update_user(user_id: str, body: UserUpdate, request: Request):
    current_user = await get_current_user(request)
    if current_user["role"] not in ["superadmin", "administrador"]:
        raise HTTPException(status_code=403, detail="No tiene permisos")

    target_user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not target_user or target_user.get("business_id") != current_user["business_id"]:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if "role" in update_data and update_data["role"] not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Rol inválido")

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update_data})

    updated = await db.users.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
    updated["id"] = str(updated.pop("_id"))
    return updated


@router.delete("/{user_id}")
async def deactivate_user(user_id: str, request: Request):
    current_user = await get_current_user(request)
    if current_user["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Solo el superadmin puede desactivar usuarios")

    if current_user["_id"] == user_id:
        raise HTTPException(status_code=400, detail="No puede desactivarse a sí mismo")

    result = await db.users.update_one(
        {"_id": ObjectId(user_id), "business_id": current_user["business_id"]},
        {"$set": {"is_active": False}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"message": "Usuario desactivado"}


@router.get("/roles")
async def get_roles():
    return {"roles": [
        {"value": "superadmin", "label": "Superadmin (Dueño)"},
        {"value": "administrador", "label": "Administrador de Local"},
        {"value": "vendedor", "label": "Vendedor / Cajero"},
        {"value": "bodeguero", "label": "Bodeguero"},
        {"value": "contador", "label": "Contador"},
    ]}
