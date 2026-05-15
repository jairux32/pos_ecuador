from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from database import db
from auth import get_current_user
from utils.ecuador import validar_ruc_ecuatoriano

router = APIRouter(prefix="/api/suppliers", tags=["suppliers"])


class SupplierCreate(BaseModel):
    ruc: str
    razon_social: str
    nombre_comercial: Optional[str] = ""
    contacto_nombre: Optional[str] = ""
    contacto_telefono: Optional[str] = ""
    contacto_email: Optional[str] = ""
    direccion: Optional[str] = ""
    condiciones_pago: Optional[str] = "Contado"
    notas: Optional[str] = ""


class SupplierUpdate(BaseModel):
    razon_social: Optional[str] = None
    nombre_comercial: Optional[str] = None
    contacto_nombre: Optional[str] = None
    contacto_telefono: Optional[str] = None
    contacto_email: Optional[str] = None
    direccion: Optional[str] = None
    condiciones_pago: Optional[str] = None
    notas: Optional[str] = None
    is_active: Optional[bool] = None


class PurchaseOrderItem(BaseModel):
    producto_id: str
    producto_nombre: str
    cantidad: float
    precio_unitario: float


class PurchaseOrderCreate(BaseModel):
    proveedor_id: str
    items: List[PurchaseOrderItem]
    notas: Optional[str] = ""


class ReceiveMerchandise(BaseModel):
    order_id: str
    items_received: List[dict]
    notas: Optional[str] = ""


@router.get("/")
async def get_suppliers(request: Request, search: Optional[str] = None):
    user = await get_current_user(request)
    query = {"business_id": user["business_id"]}
    if search:
        query["$or"] = [
            {"razon_social": {"$regex": search, "$options": "i"}},
            {"nombre_comercial": {"$regex": search, "$options": "i"}},
            {"ruc": {"$regex": search, "$options": "i"}},
        ]
    suppliers = await db.suppliers.find(query, {"_id": 0}).sort("razon_social", 1).to_list(500)
    return {"suppliers": suppliers}


@router.post("/")
async def create_supplier(body: SupplierCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["superadmin", "administrador", "bodeguero"]:
        raise HTTPException(status_code=403, detail="No tiene permisos")

    existing = await db.suppliers.find_one({
        "business_id": user["business_id"], "ruc": body.ruc
    })
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe un proveedor con este RUC")

    if body.ruc and len(body.ruc) == 13 and not validar_ruc_ecuatoriano(body.ruc):
        raise HTTPException(status_code=400, detail="RUC inválido")

    doc = {
        "id": str(uuid.uuid4()),
        "business_id": user["business_id"],
        "ruc": body.ruc,
        "razon_social": body.razon_social,
        "nombre_comercial": body.nombre_comercial or body.razon_social,
        "contacto_nombre": body.contacto_nombre or "",
        "contacto_telefono": body.contacto_telefono or "",
        "contacto_email": body.contacto_email or "",
        "direccion": body.direccion or "",
        "condiciones_pago": body.condiciones_pago or "Contado",
        "notas": body.notas or "",
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.suppliers.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{supplier_id}")
async def update_supplier(supplier_id: str, body: SupplierUpdate, request: Request):
    user = await get_current_user(request)
    supplier = await db.suppliers.find_one({"id": supplier_id, "business_id": user["business_id"]})
    if not supplier:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.suppliers.update_one({"id": supplier_id}, {"$set": update_data})
    updated = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    return updated


@router.delete("/{supplier_id}")
async def delete_supplier(supplier_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.suppliers.update_one(
        {"id": supplier_id, "business_id": user["business_id"]},
        {"$set": {"is_active": False}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    return {"message": "Proveedor desactivado"}


@router.post("/purchase-orders")
async def create_purchase_order(body: PurchaseOrderCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["superadmin", "administrador", "bodeguero"]:
        raise HTTPException(status_code=403, detail="No tiene permisos")

    supplier = await db.suppliers.find_one({"id": body.proveedor_id, "business_id": user["business_id"]})
    if not supplier:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    total = sum(i.cantidad * i.precio_unitario for i in body.items)
    order_doc = {
        "id": str(uuid.uuid4()),
        "business_id": user["business_id"],
        "proveedor_id": body.proveedor_id,
        "proveedor_nombre": supplier.get("razon_social", ""),
        "items": [i.model_dump() for i in body.items],
        "total": round(total, 2),
        "estado": "pendiente",
        "notas": body.notas or "",
        "creado_por": user.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.purchase_orders.insert_one(order_doc)
    order_doc.pop("_id", None)
    return order_doc


@router.get("/purchase-orders")
async def get_purchase_orders(
    request: Request, supplier_id: Optional[str] = None,
    status: Optional[str] = None, page: int = 1, limit: int = 50
):
    user = await get_current_user(request)
    query = {"business_id": user["business_id"]}
    if supplier_id:
        query["proveedor_id"] = supplier_id
    if status:
        query["estado"] = status

    skip = (page - 1) * limit
    total = await db.purchase_orders.count_documents(query)
    orders = await db.purchase_orders.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"orders": orders, "total": total, "page": page}


@router.post("/receive-merchandise")
async def receive_merchandise(body: ReceiveMerchandise, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["superadmin", "administrador", "bodeguero"]:
        raise HTTPException(status_code=403, detail="No tiene permisos")

    order = await db.purchase_orders.find_one({
        "id": body.order_id, "business_id": user["business_id"]
    })
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if order.get("estado") == "recibida":
        raise HTTPException(status_code=400, detail="Esta orden ya fue recibida")

    for item in body.items_received:
        pid = item.get("producto_id")
        qty = item.get("cantidad_recibida", 0)
        if qty <= 0:
            continue
        product = await db.products.find_one({"id": pid, "business_id": user["business_id"]})
        if not product:
            continue
        old_stock = product.get("stock_actual", 0)
        new_stock = old_stock + qty
        await db.products.update_one(
            {"id": pid},
            {"$set": {"stock_actual": new_stock, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        await db.inventory_movements.insert_one({
            "id": str(uuid.uuid4()),
            "business_id": user["business_id"],
            "producto_id": pid,
            "producto_nombre": product.get("nombre", ""),
            "tipo": "entrada",
            "cantidad": qty,
            "stock_anterior": old_stock,
            "stock_nuevo": new_stock,
            "motivo": f"Recepción OC {order['id'][:8]}",
            "usuario_id": user["_id"],
            "usuario_nombre": user.get("name", ""),
            "created_at": datetime.now(timezone.utc).isoformat()
        })

    await db.purchase_orders.update_one(
        {"id": body.order_id},
        {"$set": {
            "estado": "recibida",
            "recibido_por": user.get("name", ""),
            "recibido_at": datetime.now(timezone.utc).isoformat(),
            "notas_recepcion": body.notas or ""
        }}
    )
    return {"message": "Mercadería recibida y stock actualizado"}


@router.get("/purchase-history/{supplier_id}")
async def purchase_history(supplier_id: str, request: Request):
    user = await get_current_user(request)
    orders = await db.purchase_orders.find(
        {"business_id": user["business_id"], "proveedor_id": supplier_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return {"orders": orders}
