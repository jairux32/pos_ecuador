from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId
import uuid

from database import db
from auth import get_current_user
from utils.ecuador import UNIDADES_MEDIDA, TASAS_IVA, MOTIVOS_AJUSTE_INVENTARIO
from utils.storage import upload_file

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


class ProductCreate(BaseModel):
    codigo_interno: Optional[str] = None
    codigo_barras: Optional[str] = None
    nombre: str
    descripcion: Optional[str] = ""
    categoria_id: Optional[str] = None
    categoria_nombre: Optional[str] = "General"
    unidad_medida: str = "Unidad"
    precio_costo: float = 0
    precio_venta: float = 0
    iva_porcentaje: float = 15
    stock_actual: float = 0
    stock_minimo: float = 0
    stock_maximo: float = 1000
    ubicacion: Optional[str] = ""
    proveedor_id: Optional[str] = None
    imagen_path: Optional[str] = None


class ProductUpdate(BaseModel):
    codigo_interno: Optional[str] = None
    codigo_barras: Optional[str] = None
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    categoria_id: Optional[str] = None
    categoria_nombre: Optional[str] = None
    unidad_medida: Optional[str] = None
    precio_costo: Optional[float] = None
    precio_venta: Optional[float] = None
    iva_porcentaje: Optional[float] = None
    stock_actual: Optional[float] = None
    stock_minimo: Optional[float] = None
    stock_maximo: Optional[float] = None
    ubicacion: Optional[str] = None
    proveedor_id: Optional[str] = None
    imagen_path: Optional[str] = None
    is_active: Optional[bool] = None


class StockAdjustment(BaseModel):
    producto_id: str
    cantidad: float
    tipo: str  # entrada, salida, ajuste
    motivo: str
    notas: Optional[str] = ""


class CategoryCreate(BaseModel):
    nombre: str


@router.get("/units")
async def get_units():
    return {"units": UNIDADES_MEDIDA}


@router.get("/iva-rates")
async def get_iva_rates():
    return {"rates": TASAS_IVA}


@router.get("/adjustment-reasons")
async def get_adjustment_reasons():
    return {"reasons": MOTIVOS_AJUSTE_INVENTARIO}


@router.get("/categories")
async def get_categories(request: Request):
    user = await get_current_user(request)
    categories = await db.categories.find(
        {"business_id": user["business_id"]}, {"_id": 0}
    ).to_list(200)
    return {"categories": categories}


@router.post("/categories")
async def create_category(body: CategoryCreate, request: Request):
    user = await get_current_user(request)
    cat_doc = {
        "id": str(uuid.uuid4()),
        "business_id": user["business_id"],
        "nombre": body.nombre,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.categories.insert_one(cat_doc)
    return {"id": cat_doc["id"], "nombre": cat_doc["nombre"]}


@router.get("/products")
async def get_products(
    request: Request,
    search: Optional[str] = None,
    category: Optional[str] = None,
    low_stock: Optional[bool] = False,
    page: int = 1,
    limit: int = 50
):
    user = await get_current_user(request)
    query = {"business_id": user["business_id"], "is_active": True}

    if search:
        query["$or"] = [
            {"nombre": {"$regex": search, "$options": "i"}},
            {"codigo_interno": {"$regex": search, "$options": "i"}},
            {"codigo_barras": {"$regex": search, "$options": "i"}},
        ]
    if category:
        query["categoria_nombre"] = category

    if low_stock:
        query["$expr"] = {"$lte": ["$stock_actual", "$stock_minimo"]}

    skip = (page - 1) * limit
    total = await db.products.count_documents(query)
    products = await db.products.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)

    return {
        "products": products,
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit
    }


@router.post("/products")
async def create_product(body: ProductCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["superadmin", "administrador", "bodeguero"]:
        raise HTTPException(status_code=403, detail="No tiene permisos para crear productos")

    product_id = str(uuid.uuid4())
    codigo_interno = body.codigo_interno or f"P-{product_id[:8].upper()}"

    product_doc = {
        "id": product_id,
        "business_id": user["business_id"],
        "codigo_interno": codigo_interno,
        "codigo_barras": body.codigo_barras or "",
        "nombre": body.nombre,
        "descripcion": body.descripcion or "",
        "categoria_id": body.categoria_id,
        "categoria_nombre": body.categoria_nombre or "General",
        "unidad_medida": body.unidad_medida,
        "precio_costo": body.precio_costo,
        "precio_venta": body.precio_venta,
        "iva_porcentaje": body.iva_porcentaje,
        "stock_actual": body.stock_actual,
        "stock_minimo": body.stock_minimo,
        "stock_maximo": body.stock_maximo,
        "ubicacion": body.ubicacion or "",
        "proveedor_id": body.proveedor_id,
        "imagen_path": body.imagen_path,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.products.insert_one(product_doc)

    await db.inventory_movements.insert_one({
        "id": str(uuid.uuid4()),
        "business_id": user["business_id"],
        "producto_id": product_id,
        "producto_nombre": body.nombre,
        "tipo": "entrada",
        "cantidad": body.stock_actual,
        "stock_anterior": 0,
        "stock_nuevo": body.stock_actual,
        "motivo": "Stock inicial",
        "usuario_id": user["_id"],
        "usuario_nombre": user.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    product_doc.pop("_id", None)
    return product_doc


@router.get("/products/{product_id}")
async def get_product(product_id: str, request: Request):
    user = await get_current_user(request)
    product = await db.products.find_one(
        {"id": product_id, "business_id": user["business_id"]}, {"_id": 0}
    )
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return product


@router.put("/products/{product_id}")
async def update_product(product_id: str, body: ProductUpdate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["superadmin", "administrador", "bodeguero"]:
        raise HTTPException(status_code=403, detail="No tiene permisos para editar productos")

    product = await db.products.find_one(
        {"id": product_id, "business_id": user["business_id"]}
    )
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.products.update_one(
        {"id": product_id}, {"$set": update_data}
    )
    updated = await db.products.find_one({"id": product_id}, {"_id": 0})
    return updated


@router.delete("/products/{product_id}")
async def delete_product(product_id: str, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["superadmin", "administrador"]:
        raise HTTPException(status_code=403, detail="No tiene permisos para eliminar productos")

    result = await db.products.update_one(
        {"id": product_id, "business_id": user["business_id"]},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return {"message": "Producto eliminado"}


@router.post("/stock-adjustment")
async def adjust_stock(body: StockAdjustment, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["superadmin", "administrador", "bodeguero"]:
        raise HTTPException(status_code=403, detail="No tiene permisos para ajustar stock")

    product = await db.products.find_one(
        {"id": body.producto_id, "business_id": user["business_id"]}
    )
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    stock_anterior = product["stock_actual"]
    if body.tipo == "entrada":
        nuevo_stock = stock_anterior + body.cantidad
    elif body.tipo == "salida":
        nuevo_stock = stock_anterior - body.cantidad
        if nuevo_stock < 0:
            raise HTTPException(status_code=400, detail="Stock insuficiente")
    else:
        nuevo_stock = body.cantidad

    await db.products.update_one(
        {"id": body.producto_id},
        {"$set": {"stock_actual": nuevo_stock, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    movement_doc = {
        "id": str(uuid.uuid4()),
        "business_id": user["business_id"],
        "producto_id": body.producto_id,
        "producto_nombre": product["nombre"],
        "tipo": body.tipo,
        "cantidad": body.cantidad,
        "stock_anterior": stock_anterior,
        "stock_nuevo": nuevo_stock,
        "motivo": body.motivo,
        "notas": body.notas or "",
        "usuario_id": user["_id"],
        "usuario_nombre": user.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.inventory_movements.insert_one(movement_doc)
    movement_doc.pop("_id", None)
    return movement_doc


@router.get("/movements")
async def get_movements(
    request: Request,
    product_id: Optional[str] = None,
    page: int = 1,
    limit: int = 50
):
    user = await get_current_user(request)
    query = {"business_id": user["business_id"]}
    if product_id:
        query["producto_id"] = product_id

    skip = (page - 1) * limit
    total = await db.inventory_movements.count_documents(query)
    movements = await db.inventory_movements.find(
        query, {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)

    return {"movements": movements, "total": total, "page": page}


@router.get("/low-stock")
async def get_low_stock(request: Request):
    user = await get_current_user(request)
    products = await db.products.find(
        {
            "business_id": user["business_id"],
            "is_active": True,
            "$expr": {"$lte": ["$stock_actual", "$stock_minimo"]}
        },
        {"_id": 0}
    ).to_list(200)
    return {"products": products, "count": len(products)}


@router.post("/upload-image")
async def upload_product_image(request: Request, file: UploadFile = File(...)):
    await get_current_user(request)
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Solo se permiten imágenes")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Máximo 5MB")
    try:
        path = upload_file(data, file.filename, file.content_type, "products")
        return {"path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
