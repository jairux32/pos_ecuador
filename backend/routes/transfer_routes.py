from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid

from database import db
from auth import get_current_user
from routes.audit_routes import log_audit

router = APIRouter(prefix="/api/transfers", tags=["transfers"])


class TransferCreate(BaseModel):
    producto_id: str
    cantidad: float
    origen_branch_id: str
    destino_branch_id: str
    notas: Optional[str] = ""


@router.post("/")
async def create_transfer(body: TransferCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["superadmin", "administrador", "bodeguero"]:
        raise HTTPException(status_code=403, detail="No tiene permisos para transferir stock")

    if body.origen_branch_id == body.destino_branch_id:
        raise HTTPException(status_code=400, detail="Origen y destino deben ser diferentes")
    if body.cantidad <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0")

    # Verify both branches belong to same business
    origen = await db.branches.find_one({"id": body.origen_branch_id, "business_id": user["business_id"]})
    destino = await db.branches.find_one({"id": body.destino_branch_id, "business_id": user["business_id"]})
    if not origen or not destino:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada")

    product = await db.products.find_one({
        "id": body.producto_id, "business_id": user["business_id"], "is_active": True
    })
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    if product.get("stock_actual", 0) < body.cantidad:
        raise HTTPException(status_code=400, detail=f"Stock insuficiente. Disponible: {product.get('stock_actual', 0)}")

    transfer_id = str(uuid.uuid4())
    old_stock = product["stock_actual"]
    new_stock = old_stock - body.cantidad

    # Deduct from source
    await db.products.update_one(
        {"id": body.producto_id},
        {"$set": {"stock_actual": new_stock, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    # Record movement - salida
    await db.inventory_movements.insert_one({
        "id": str(uuid.uuid4()),
        "business_id": user["business_id"],
        "producto_id": body.producto_id,
        "producto_nombre": product["nombre"],
        "tipo": "salida",
        "cantidad": body.cantidad,
        "stock_anterior": old_stock,
        "stock_nuevo": new_stock,
        "motivo": f"Transferencia a {destino.get('nombre', '')}",
        "usuario_id": user["id"],
        "usuario_nombre": user.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    # Record movement - entrada (at destination, conceptual)
    await db.inventory_movements.insert_one({
        "id": str(uuid.uuid4()),
        "business_id": user["business_id"],
        "producto_id": body.producto_id,
        "producto_nombre": product["nombre"],
        "tipo": "entrada",
        "cantidad": body.cantidad,
        "stock_anterior": 0,
        "stock_nuevo": body.cantidad,
        "motivo": f"Transferencia desde {origen.get('nombre', '')}",
        "usuario_id": user["id"],
        "usuario_nombre": user.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    transfer_doc = {
        "id": transfer_id,
        "business_id": user["business_id"],
        "producto_id": body.producto_id,
        "producto_nombre": product["nombre"],
        "cantidad": body.cantidad,
        "origen_branch_id": body.origen_branch_id,
        "origen_branch_nombre": origen.get("nombre", ""),
        "destino_branch_id": body.destino_branch_id,
        "destino_branch_nombre": destino.get("nombre", ""),
        "notas": body.notas or "",
        "estado": "completada",
        "creado_por": user.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.stock_transfers.insert_one(transfer_doc)

    await log_audit(
        business_id=user["business_id"],
        user_id=user["id"],
        user_name=user.get("name", ""),
        action="transferir_stock",
        entity_type="inventario",
        entity_id=transfer_id,
        details=f"{product['nombre']}: {body.cantidad} unidades de {origen.get('nombre','')} a {destino.get('nombre','')}",
        ip=request.client.host if request.client else ""
    )

    transfer_doc.pop("_id", None)
    return transfer_doc


@router.get("/")
async def get_transfers(request: Request, page: int = 1, limit: int = 50):
    user = await get_current_user(request)
    query = {"business_id": user["business_id"]}
    skip = (page - 1) * limit
    total = await db.stock_transfers.count_documents(query)
    transfers = await db.stock_transfers.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"transfers": transfers, "total": total, "page": page}
