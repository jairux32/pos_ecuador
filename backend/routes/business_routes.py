from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId
import uuid

from database import db
from auth import get_current_user, hash_password
from utils.ecuador import (
    PROVINCIAS_ECUADOR, SECTORES_NEGOCIO, REGIMENES_TRIBUTARIOS,
    validar_ruc_ecuatoriano
)
from utils.storage import upload_file

router = APIRouter(prefix="/api/business", tags=["business"])


class BusinessCreate(BaseModel):
    nombre_comercial: str
    razon_social: str
    ruc: str
    direccion_matriz: str
    sector: str
    regimen_tributario: str
    logo_path: Optional[str] = None


class BranchCreate(BaseModel):
    nombre: str
    provincia: str
    canton: str
    direccion: str
    telefono: str
    codigo_establecimiento: str
    punto_emision: str


class SetupRequest(BaseModel):
    business: BusinessCreate
    branches: List[BranchCreate]
    admin_email: str
    admin_password: str
    admin_name: str


@router.get("/provinces")
async def get_provinces():
    return {"provinces": PROVINCIAS_ECUADOR}


@router.get("/sectors")
async def get_sectors():
    return {"sectors": SECTORES_NEGOCIO}


@router.get("/tax-regimes")
async def get_tax_regimes():
    return {"regimes": REGIMENES_TRIBUTARIOS}


@router.post("/validate-ruc")
async def validate_ruc(data: dict):
    ruc = data.get("ruc", "")
    is_valid = validar_ruc_ecuatoriano(ruc)
    return {"valid": is_valid, "ruc": ruc}


@router.post("/setup")
async def setup_business(body: SetupRequest):
    if not validar_ruc_ecuatoriano(body.business.ruc):
        raise HTTPException(status_code=400, detail="RUC inválido. Debe tener 13 dígitos y ser válido según el formato ecuatoriano.")

    existing = await db.businesses.find_one({"ruc": body.business.ruc})
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe un negocio con este RUC")

    existing_user = await db.users.find_one({"email": body.admin_email.strip().lower()})
    if existing_user:
        raise HTTPException(status_code=400, detail="El email del administrador ya está registrado")

    business_id = str(uuid.uuid4())
    business_doc = {
        "id": business_id,
        "nombre_comercial": body.business.nombre_comercial,
        "razon_social": body.business.razon_social,
        "ruc": body.business.ruc,
        "direccion_matriz": body.business.direccion_matriz,
        "sector": body.business.sector,
        "regimen_tributario": body.business.regimen_tributario,
        "logo_path": body.business.logo_path,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.businesses.insert_one(business_doc)

    branch_ids = []
    for branch in body.branches:
        if len(branch.codigo_establecimiento) != 3 or not branch.codigo_establecimiento.isdigit():
            raise HTTPException(status_code=400, detail=f"Código de establecimiento inválido: {branch.codigo_establecimiento}")
        if len(branch.punto_emision) != 3 or not branch.punto_emision.isdigit():
            raise HTTPException(status_code=400, detail=f"Punto de emisión inválido: {branch.punto_emision}")

        branch_id = str(uuid.uuid4())
        branch_doc = {
            "id": branch_id,
            "business_id": business_id,
            "nombre": branch.nombre,
            "provincia": branch.provincia,
            "canton": branch.canton,
            "direccion": branch.direccion,
            "telefono": branch.telefono,
            "codigo_establecimiento": branch.codigo_establecimiento,
            "punto_emision": branch.punto_emision,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.branches.insert_one(branch_doc)
        branch_ids.append(branch_id)

    hashed = hash_password(body.admin_password)
    user_doc = {
        "email": body.admin_email.strip().lower(),
        "password_hash": hashed,
        "name": body.admin_name,
        "role": "superadmin",
        "business_id": business_id,
        "branch_ids": branch_ids,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)

    await db.categories.insert_many([
        {"id": str(uuid.uuid4()), "business_id": business_id, "nombre": cat, "created_at": datetime.now(timezone.utc).isoformat()}
        for cat in ["General", "Alimentos", "Bebidas", "Limpieza", "Cuidado Personal", "Electrónica"]
    ])

    return {
        "business_id": business_id,
        "branch_ids": branch_ids,
        "message": "Negocio configurado exitosamente"
    }


@router.post("/upload-logo")
async def upload_logo(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos de imagen")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="El archivo no debe superar 5MB")
    try:
        path = upload_file(data, file.filename, file.content_type, "logos")
        return {"path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al subir archivo: {str(e)}")


@router.get("/my-business")
async def get_my_business(request: Request):
    user = await get_current_user(request)
    if not user.get("business_id"):
        raise HTTPException(status_code=404, detail="No tiene negocio asociado")
    business = await db.businesses.find_one({"id": user["business_id"]}, {"_id": 0})
    if not business:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")
    branches = await db.branches.find({"business_id": user["business_id"]}, {"_id": 0}).to_list(100)
    return {"business": business, "branches": branches}


@router.get("/branches")
async def get_branches(request: Request):
    user = await get_current_user(request)
    if not user.get("business_id"):
        return {"branches": []}
    branches = await db.branches.find({"business_id": user["business_id"]}, {"_id": 0}).to_list(100)
    return {"branches": branches}
