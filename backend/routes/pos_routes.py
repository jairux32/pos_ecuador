from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from database import db
from auth import get_current_user
from utils.ecuador import validar_cedula_ecuatoriana, validar_ruc_ecuatoriano

router = APIRouter(prefix="/api/pos", tags=["pos"])


class CartItem(BaseModel):
    producto_id: str
    nombre: str
    cantidad: float
    precio_unitario: float
    descuento: float = 0
    iva_porcentaje: float = 15


class PaymentMethod(BaseModel):
    metodo: str  # efectivo, tarjeta, transferencia
    monto: float
    referencia: Optional[str] = ""


class ClientData(BaseModel):
    tipo_identificacion: str = "consumidor_final"  # cedula, ruc, consumidor_final
    identificacion: Optional[str] = ""
    nombre: Optional[str] = "Consumidor Final"
    email: Optional[str] = ""
    telefono: Optional[str] = ""
    direccion: Optional[str] = ""


class SaleRequest(BaseModel):
    items: List[CartItem]
    pagos: List[PaymentMethod]
    cliente: ClientData
    tipo_documento: str = "ninguno"  # factura, nota_venta, ninguno
    descuento_global: float = 0
    branch_id: Optional[str] = None


class CashRegisterOpen(BaseModel):
    monto_inicial: float
    branch_id: str


class CashRegisterClose(BaseModel):
    register_id: str
    efectivo_contado: float
    notas: Optional[str] = ""


class CashMovement(BaseModel):
    register_id: str
    tipo: str  # ingreso, egreso
    monto: float
    concepto: str


@router.post("/open-register")
async def open_register(body: CashRegisterOpen, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["superadmin", "administrador", "vendedor"]:
        raise HTTPException(status_code=403, detail="No tiene permisos")

    active = await db.cash_registers.find_one({
        "business_id": user["business_id"],
        "branch_id": body.branch_id,
        "usuario_id": user["_id"],
        "estado": "abierta"
    })
    if active:
        active.pop("_id", None)
        return active

    register_doc = {
        "id": str(uuid.uuid4()),
        "business_id": user["business_id"],
        "branch_id": body.branch_id,
        "usuario_id": user["_id"],
        "usuario_nombre": user.get("name", ""),
        "monto_inicial": body.monto_inicial,
        "ventas_efectivo": 0,
        "ventas_tarjeta": 0,
        "ventas_transferencia": 0,
        "ingresos_manuales": 0,
        "egresos_manuales": 0,
        "total_ventas": 0,
        "num_ventas": 0,
        "estado": "abierta",
        "opened_at": datetime.now(timezone.utc).isoformat(),
        "closed_at": None
    }
    await db.cash_registers.insert_one(register_doc)
    register_doc.pop("_id", None)
    return register_doc


@router.post("/close-register")
async def close_register(body: CashRegisterClose, request: Request):
    user = await get_current_user(request)
    register = await db.cash_registers.find_one({
        "id": body.register_id,
        "business_id": user["business_id"],
        "estado": "abierta"
    })
    if not register:
        raise HTTPException(status_code=404, detail="Caja no encontrada o ya cerrada")

    esperado = (
        register["monto_inicial"]
        + register["ventas_efectivo"]
        + register["ingresos_manuales"]
        - register["egresos_manuales"]
    )
    diferencia = body.efectivo_contado - esperado

    await db.cash_registers.update_one(
        {"id": body.register_id},
        {"$set": {
            "estado": "cerrada",
            "efectivo_contado": body.efectivo_contado,
            "efectivo_esperado": esperado,
            "diferencia": diferencia,
            "notas": body.notas or "",
            "closed_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    updated = await db.cash_registers.find_one({"id": body.register_id}, {"_id": 0})
    return updated


@router.post("/cash-movement")
async def cash_movement(body: CashMovement, request: Request):
    user = await get_current_user(request)
    register = await db.cash_registers.find_one({
        "id": body.register_id, "estado": "abierta"
    })
    if not register:
        raise HTTPException(status_code=404, detail="Caja no encontrada o cerrada")

    if body.tipo == "ingreso":
        await db.cash_registers.update_one(
            {"id": body.register_id},
            {"$inc": {"ingresos_manuales": body.monto}}
        )
    else:
        await db.cash_registers.update_one(
            {"id": body.register_id},
            {"$inc": {"egresos_manuales": body.monto}}
        )

    movement = {
        "id": str(uuid.uuid4()),
        "register_id": body.register_id,
        "tipo": body.tipo,
        "monto": body.monto,
        "concepto": body.concepto,
        "usuario_nombre": user.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.cash_movements.insert_one(movement)
    movement.pop("_id", None)
    return movement


@router.get("/active-register")
async def get_active_register(request: Request, branch_id: str = ""):
    user = await get_current_user(request)
    query = {
        "business_id": user["business_id"],
        "usuario_id": user["_id"],
        "estado": "abierta"
    }
    if branch_id:
        query["branch_id"] = branch_id
    register = await db.cash_registers.find_one(query, {"_id": 0})
    return {"register": register}


@router.post("/sell")
async def create_sale(body: SaleRequest, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["superadmin", "administrador", "vendedor"]:
        raise HTTPException(status_code=403, detail="No tiene permisos para vender")

    if body.cliente.tipo_identificacion == "cedula" and body.cliente.identificacion:
        if not validar_cedula_ecuatoriana(body.cliente.identificacion):
            raise HTTPException(status_code=400, detail="Cédula inválida")
    elif body.cliente.tipo_identificacion == "ruc" and body.cliente.identificacion:
        if not validar_ruc_ecuatoriano(body.cliente.identificacion):
            raise HTTPException(status_code=400, detail="RUC inválido")

    subtotal_0 = 0
    subtotal_5 = 0
    subtotal_15 = 0
    subtotal_sin_iva = 0
    total_iva = 0
    sale_items = []

    for item in body.items:
        product = await db.products.find_one({"id": item.producto_id, "business_id": user["business_id"]})
        if not product:
            raise HTTPException(status_code=404, detail=f"Producto {item.nombre} no encontrado")
        if product["stock_actual"] < item.cantidad:
            raise HTTPException(status_code=400, detail=f"Stock insuficiente para {item.nombre}")

        subtotal_item = item.cantidad * item.precio_unitario - item.descuento
        iva_item = subtotal_item * (item.iva_porcentaje / 100)

        if item.iva_porcentaje == 0:
            subtotal_0 += subtotal_item
        elif item.iva_porcentaje == 5:
            subtotal_5 += subtotal_item
        else:
            subtotal_15 += subtotal_item
        subtotal_sin_iva += subtotal_item
        total_iva += iva_item

        sale_items.append({
            "producto_id": item.producto_id,
            "nombre": item.nombre,
            "cantidad": item.cantidad,
            "precio_unitario": item.precio_unitario,
            "descuento": item.descuento,
            "iva_porcentaje": item.iva_porcentaje,
            "subtotal": round(subtotal_item, 2),
            "iva": round(iva_item, 2),
            "total": round(subtotal_item + iva_item, 2)
        })

    descuento_global = body.descuento_global
    total_sin_iva = subtotal_sin_iva - descuento_global
    total = round(total_sin_iva + total_iva, 2)

    total_pagado = sum(p.monto for p in body.pagos)
    if round(total_pagado, 2) < round(total, 2):
        raise HTTPException(status_code=400, detail=f"Pago insuficiente. Total: ${total}, Pagado: ${total_pagado}")

    sale_id = str(uuid.uuid4())
    sale_doc = {
        "id": sale_id,
        "business_id": user["business_id"],
        "branch_id": body.branch_id or (user.get("branch_ids", [None])[0] if user.get("branch_ids") else None),
        "vendedor_id": user["_id"],
        "vendedor_nombre": user.get("name", ""),
        "cliente": body.cliente.model_dump(),
        "items": sale_items,
        "subtotal_0": round(subtotal_0, 2),
        "subtotal_5": round(subtotal_5, 2),
        "subtotal_15": round(subtotal_15, 2),
        "subtotal_sin_iva": round(subtotal_sin_iva, 2),
        "descuento_global": descuento_global,
        "total_iva": round(total_iva, 2),
        "total": total,
        "pagos": [p.model_dump() for p in body.pagos],
        "cambio": round(total_pagado - total, 2),
        "tipo_documento": body.tipo_documento,
        "estado": "completada",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.sales.insert_one(sale_doc)

    for item in body.items:
        await db.products.update_one(
            {"id": item.producto_id},
            {"$inc": {"stock_actual": -item.cantidad}}
        )
        await db.inventory_movements.insert_one({
            "id": str(uuid.uuid4()),
            "business_id": user["business_id"],
            "producto_id": item.producto_id,
            "producto_nombre": item.nombre,
            "tipo": "salida",
            "cantidad": item.cantidad,
            "motivo": f"Venta {sale_id[:8]}",
            "usuario_id": user["_id"],
            "usuario_nombre": user.get("name", ""),
            "created_at": datetime.now(timezone.utc).isoformat()
        })

    active_register = await db.cash_registers.find_one({
        "business_id": user["business_id"],
        "usuario_id": user["_id"],
        "estado": "abierta"
    })
    if active_register:
        efectivo = sum(p.monto for p in body.pagos if p.metodo == "efectivo")
        tarjeta = sum(p.monto for p in body.pagos if p.metodo == "tarjeta")
        transferencia = sum(p.monto for p in body.pagos if p.metodo == "transferencia")
        await db.cash_registers.update_one(
            {"id": active_register["id"]},
            {"$inc": {
                "ventas_efectivo": efectivo,
                "ventas_tarjeta": tarjeta,
                "ventas_transferencia": transferencia,
                "total_ventas": total,
                "num_ventas": 1
            }}
        )

    if body.cliente.identificacion and body.cliente.tipo_identificacion != "consumidor_final":
        existing_client = await db.clients.find_one({
            "business_id": user["business_id"],
            "identificacion": body.cliente.identificacion
        })
        if not existing_client:
            await db.clients.insert_one({
                "id": str(uuid.uuid4()),
                "business_id": user["business_id"],
                "tipo_identificacion": body.cliente.tipo_identificacion,
                "identificacion": body.cliente.identificacion,
                "nombre": body.cliente.nombre,
                "email": body.cliente.email or "",
                "telefono": body.cliente.telefono or "",
                "direccion": body.cliente.direccion or "",
                "created_at": datetime.now(timezone.utc).isoformat()
            })

    sale_doc.pop("_id", None)
    return sale_doc


@router.get("/sales")
async def get_sales(
    request: Request,
    page: int = 1,
    limit: int = 50,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
):
    user = await get_current_user(request)
    query = {"business_id": user["business_id"]}
    if date_from:
        query["created_at"] = {"$gte": date_from}
    if date_to:
        if "created_at" in query:
            query["created_at"]["$lte"] = date_to
        else:
            query["created_at"] = {"$lte": date_to}

    skip = (page - 1) * limit
    total = await db.sales.count_documents(query)
    sales = await db.sales.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"sales": sales, "total": total, "page": page}


@router.get("/sales/{sale_id}")
async def get_sale(sale_id: str, request: Request):
    user = await get_current_user(request)
    sale = await db.sales.find_one(
        {"id": sale_id, "business_id": user["business_id"]}, {"_id": 0}
    )
    if not sale:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    return sale


@router.get("/clients")
async def get_clients(request: Request, search: Optional[str] = None):
    user = await get_current_user(request)
    query = {"business_id": user["business_id"]}
    if search:
        query["$or"] = [
            {"nombre": {"$regex": search, "$options": "i"}},
            {"identificacion": {"$regex": search, "$options": "i"}},
        ]
    clients = await db.clients.find(query, {"_id": 0}).to_list(200)
    return {"clients": clients}


@router.get("/dashboard-stats")
async def get_dashboard_stats(request: Request):
    user = await get_current_user(request)
    bid = user["business_id"]

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    total_products = await db.products.count_documents({"business_id": bid, "is_active": True})
    low_stock = await db.products.count_documents({
        "business_id": bid, "is_active": True,
        "$expr": {"$lte": ["$stock_actual", "$stock_minimo"]}
    })

    today_sales = await db.sales.find(
        {"business_id": bid, "created_at": {"$gte": today}}, {"_id": 0, "total": 1}
    ).to_list(10000)
    ventas_hoy = sum(s.get("total", 0) for s in today_sales)
    num_ventas_hoy = len(today_sales)

    total_clients = await db.clients.count_documents({"business_id": bid})

    return {
        "total_products": total_products,
        "low_stock_count": low_stock,
        "ventas_hoy": round(ventas_hoy, 2),
        "num_ventas_hoy": num_ventas_hoy,
        "total_clients": total_clients
    }
