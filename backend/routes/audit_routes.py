from fastapi import APIRouter, HTTPException, Request
from typing import Optional
from datetime import datetime, timezone

from database import db
from auth import get_current_user

router = APIRouter(prefix="/api/audit", tags=["audit"])


async def log_audit(business_id: str, user_id: str, user_name: str, action: str, entity_type: str, entity_id: str = "", details: str = "", ip: str = ""):
    """Log an audit event. Call from any route handler."""
    await db.audit_logs.insert_one({
        "business_id": business_id,
        "user_id": user_id,
        "user_name": user_name,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "details": details,
        "ip": ip,
        "created_at": datetime.now(timezone.utc).isoformat()
    })


@router.get("/logs")
async def get_audit_logs(
    request: Request,
    page: int = 1,
    limit: int = 50,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    user_name: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    user = await get_current_user(request)
    if user["role"] not in ["superadmin", "administrador", "contador"]:
        raise HTTPException(status_code=403, detail="No tiene permisos para ver auditoría")

    query = {"business_id": user["business_id"]}
    if action:
        query["action"] = action
    if entity_type:
        query["entity_type"] = entity_type
    if user_name:
        query["user_name"] = {"$regex": user_name, "$options": "i"}
    if date_from:
        query.setdefault("created_at", {})["$gte"] = date_from
    if date_to:
        query.setdefault("created_at", {})["$lte"] = date_to + "T23:59:59"

    skip = (page - 1) * limit
    total = await db.audit_logs.count_documents(query)
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"logs": logs, "total": total, "page": page, "pages": (total + limit - 1) // limit}


@router.get("/actions")
async def get_audit_actions():
    return {"actions": [
        "crear_producto", "editar_producto", "eliminar_producto",
        "ajustar_stock", "transferir_stock",
        "crear_venta", "anular_comprobante",
        "abrir_caja", "cerrar_caja",
        "crear_usuario", "editar_usuario", "desactivar_usuario",
        "crear_proveedor", "crear_orden_compra", "recibir_mercaderia",
        "importar_productos", "generar_comprobante",
        "login", "logout",
    ]}


@router.get("/entity-types")
async def get_entity_types():
    return {"types": [
        "producto", "venta", "comprobante", "caja", "usuario",
        "proveedor", "orden_compra", "inventario", "sesion",
    ]}
