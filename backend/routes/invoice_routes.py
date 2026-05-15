from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response as FastAPIResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
import random
from io import BytesIO

from database import db
from auth import get_current_user
from utils.ecuador import generar_clave_acceso, TIPOS_DOCUMENTO_SRI

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


class InvoiceCreate(BaseModel):
    sale_id: str
    tipo_documento: str = "01"  # 01=factura, 02=nota_venta


class InvoiceAnul(BaseModel):
    invoice_id: str
    motivo: str


@router.post("/generate")
async def generate_invoice(body: InvoiceCreate, request: Request):
    user = await get_current_user(request)

    sale = await db.sales.find_one(
        {"id": body.sale_id, "business_id": user["business_id"]}, {"_id": 0}
    )
    if not sale:
        raise HTTPException(status_code=404, detail="Venta no encontrada")

    business = await db.businesses.find_one({"id": user["business_id"]}, {"_id": 0})
    if not business:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    branch_id = sale.get("branch_id")
    branch = None
    if branch_id:
        branch = await db.branches.find_one({"id": branch_id}, {"_id": 0})

    establecimiento = branch["codigo_establecimiento"] if branch else "001"
    punto_emision = branch["punto_emision"] if branch else "001"

    seq_key = f"{user['business_id']}_{establecimiento}_{punto_emision}_{body.tipo_documento}"
    seq_doc = await db.sequences.find_one_and_update(
        {"key": seq_key},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=True
    )
    secuencial = seq_doc["value"]

    fecha = datetime.now(timezone.utc)
    codigo_numerico = str(random.randint(10000000, 99999999))

    clave_acceso = generar_clave_acceso(
        fecha=fecha,
        tipo_doc=body.tipo_documento,
        ruc=business["ruc"],
        ambiente="1",
        establecimiento=establecimiento,
        punto_emision=punto_emision,
        secuencial=secuencial,
        codigo_numerico=codigo_numerico
    )

    invoice_id = str(uuid.uuid4())
    numero_comprobante = f"{establecimiento}-{punto_emision}-{secuencial:09d}"

    invoice_doc = {
        "id": invoice_id,
        "business_id": user["business_id"],
        "sale_id": body.sale_id,
        "tipo_documento": body.tipo_documento,
        "tipo_documento_nombre": TIPOS_DOCUMENTO_SRI.get(body.tipo_documento, "Factura"),
        "numero_comprobante": numero_comprobante,
        "clave_acceso": clave_acceso,
        "establecimiento": establecimiento,
        "punto_emision": punto_emision,
        "secuencial": secuencial,
        "emisor": {
            "ruc": business["ruc"],
            "razon_social": business["razon_social"],
            "nombre_comercial": business["nombre_comercial"],
            "direccion": business.get("direccion_matriz", ""),
            "regimen": business.get("regimen_tributario", "")
        },
        "comprador": sale.get("cliente", {}),
        "items": sale.get("items", []),
        "subtotal_0": sale.get("subtotal_0", 0),
        "subtotal_5": sale.get("subtotal_5", 0),
        "subtotal_15": sale.get("subtotal_15", 0),
        "subtotal_sin_iva": sale.get("subtotal_sin_iva", 0),
        "total_iva": sale.get("total_iva", 0),
        "total": sale.get("total", 0),
        "descuento": sale.get("descuento_global", 0),
        "estado": "generado",
        "fecha_emision": fecha.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.invoices.insert_one(invoice_doc)

    await db.sales.update_one(
        {"id": body.sale_id},
        {"$set": {"invoice_id": invoice_id, "tipo_documento": body.tipo_documento}}
    )

    invoice_doc.pop("_id", None)
    return invoice_doc


@router.get("/")
async def get_invoices(
    request: Request,
    page: int = 1,
    limit: int = 50,
    estado: Optional[str] = None,
    tipo: Optional[str] = None
):
    user = await get_current_user(request)
    query = {"business_id": user["business_id"]}
    if estado:
        query["estado"] = estado
    if tipo:
        query["tipo_documento"] = tipo

    skip = (page - 1) * limit
    total = await db.invoices.count_documents(query)
    invoices = await db.invoices.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"invoices": invoices, "total": total, "page": page}


@router.get("/{invoice_id}")
async def get_invoice(invoice_id: str, request: Request):
    user = await get_current_user(request)
    invoice = await db.invoices.find_one(
        {"id": invoice_id, "business_id": user["business_id"]}, {"_id": 0}
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Comprobante no encontrado")
    return invoice


@router.post("/annul")
async def annul_invoice(body: InvoiceAnul, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["superadmin", "administrador", "contador"]:
        raise HTTPException(status_code=403, detail="No tiene permisos")

    result = await db.invoices.update_one(
        {"id": body.invoice_id, "business_id": user["business_id"], "estado": {"$ne": "anulado"}},
        {"$set": {
            "estado": "anulado",
            "motivo_anulacion": body.motivo,
            "anulado_por": user.get("name", ""),
            "anulado_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Comprobante no encontrado o ya anulado")
    return {"message": "Comprobante anulado"}


@router.get("/{invoice_id}/xml")
async def download_xml(invoice_id: str, request: Request):
    user = await get_current_user(request)
    invoice = await db.invoices.find_one(
        {"id": invoice_id, "business_id": user["business_id"]}, {"_id": 0}
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Comprobante no encontrado")

    xml_content = generate_sri_xml(invoice)
    return FastAPIResponse(
        content=xml_content,
        media_type="application/xml",
        headers={"Content-Disposition": f"attachment; filename=comprobante_{invoice['numero_comprobante']}.xml"}
    )


@router.get("/{invoice_id}/pdf")
async def download_pdf(invoice_id: str, request: Request):
    user = await get_current_user(request)
    invoice = await db.invoices.find_one(
        {"id": invoice_id, "business_id": user["business_id"]}, {"_id": 0}
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Comprobante no encontrado")

    pdf_bytes = generate_ride_pdf(invoice)
    return FastAPIResponse(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=RIDE_{invoice['numero_comprobante']}.pdf"}
    )


def generate_sri_xml(invoice: dict) -> str:
    emisor = invoice.get("emisor", {})
    comprador = invoice.get("comprador", {})
    items = invoice.get("items", [])

    tipo_id_comprador = "07"
    if comprador.get("tipo_identificacion") == "ruc":
        tipo_id_comprador = "04"
    elif comprador.get("tipo_identificacion") == "cedula":
        tipo_id_comprador = "05"

    detalles_xml = ""
    for item in items:
        detalles_xml += f"""
        <detalle>
            <codigoPrincipal>{item.get('producto_id', '')[:25]}</codigoPrincipal>
            <descripcion>{item.get('nombre', '')}</descripcion>
            <cantidad>{item.get('cantidad', 0)}</cantidad>
            <precioUnitario>{item.get('precio_unitario', 0):.2f}</precioUnitario>
            <descuento>{item.get('descuento', 0):.2f}</descuento>
            <precioTotalSinImpuesto>{item.get('subtotal', 0):.2f}</precioTotalSinImpuesto>
            <impuestos>
                <impuesto>
                    <codigo>2</codigo>
                    <codigoPorcentaje>{'0' if item.get('iva_porcentaje', 0) == 0 else '5' if item.get('iva_porcentaje', 0) == 5 else '4'}</codigoPorcentaje>
                    <tarifa>{item.get('iva_porcentaje', 0):.2f}</tarifa>
                    <baseImponible>{item.get('subtotal', 0):.2f}</baseImponible>
                    <valor>{item.get('iva', 0):.2f}</valor>
                </impuesto>
            </impuestos>
        </detalle>"""

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.1.0">
    <infoTributaria>
        <ambiente>1</ambiente>
        <tipoEmision>1</tipoEmision>
        <razonSocial>{emisor.get('razon_social', '')}</razonSocial>
        <nombreComercial>{emisor.get('nombre_comercial', '')}</nombreComercial>
        <ruc>{emisor.get('ruc', '')}</ruc>
        <claveAcceso>{invoice.get('clave_acceso', '')}</claveAcceso>
        <codDoc>{invoice.get('tipo_documento', '01')}</codDoc>
        <estab>{invoice.get('establecimiento', '001')}</estab>
        <ptoEmi>{invoice.get('punto_emision', '001')}</ptoEmi>
        <secuencial>{invoice.get('secuencial', 0):09d}</secuencial>
        <dirMatriz>{emisor.get('direccion', '')}</dirMatriz>
    </infoTributaria>
    <infoFactura>
        <fechaEmision>{invoice.get('fecha_emision', '')[:10]}</fechaEmision>
        <dirEstablecimiento>{emisor.get('direccion', '')}</dirEstablecimiento>
        <obligadoContabilidad>SI</obligadoContabilidad>
        <tipoIdentificacionComprador>{tipo_id_comprador}</tipoIdentificacionComprador>
        <razonSocialComprador>{comprador.get('nombre', 'Consumidor Final')}</razonSocialComprador>
        <identificacionComprador>{comprador.get('identificacion', '9999999999999')}</identificacionComprador>
        <totalSinImpuestos>{invoice.get('subtotal_sin_iva', 0):.2f}</totalSinImpuestos>
        <totalDescuento>{invoice.get('descuento', 0):.2f}</totalDescuento>
        <totalConImpuestos>
            <totalImpuesto>
                <codigo>2</codigo>
                <codigoPorcentaje>0</codigoPorcentaje>
                <baseImponible>{invoice.get('subtotal_0', 0):.2f}</baseImponible>
                <valor>0.00</valor>
            </totalImpuesto>
            <totalImpuesto>
                <codigo>2</codigo>
                <codigoPorcentaje>4</codigoPorcentaje>
                <baseImponible>{invoice.get('subtotal_15', 0):.2f}</baseImponible>
                <valor>{invoice.get('subtotal_15', 0) * 0.15:.2f}</valor>
            </totalImpuesto>
        </totalConImpuestos>
        <propina>0.00</propina>
        <importeTotal>{invoice.get('total', 0):.2f}</importeTotal>
        <moneda>DOLAR</moneda>
    </infoFactura>
    <detalles>{detalles_xml}
    </detalles>
</factura>"""
    return xml


def generate_ride_pdf(invoice: dict) -> bytes:
    from fpdf import FPDF

    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)

    emisor = invoice.get("emisor", {})
    comprador = invoice.get("comprador", {})
    items = invoice.get("items", [])

    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, emisor.get("nombre_comercial", ""), ln=True, align="C")
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, emisor.get("razon_social", ""), ln=True, align="C")
    pdf.cell(0, 6, f"RUC: {emisor.get('ruc', '')}", ln=True, align="C")
    pdf.cell(0, 6, emisor.get("direccion", ""), ln=True, align="C")
    pdf.ln(5)

    tipo_nombre = invoice.get("tipo_documento_nombre", "Factura")
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, f"{tipo_nombre} No. {invoice.get('numero_comprobante', '')}", ln=True, align="C")
    pdf.set_font("Helvetica", "", 8)
    pdf.cell(0, 5, f"Clave de Acceso: {invoice.get('clave_acceso', '')}", ln=True, align="C")
    pdf.cell(0, 5, f"Fecha: {invoice.get('fecha_emision', '')[:10]}", ln=True, align="C")
    pdf.ln(5)

    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(0, 6, "DATOS DEL CLIENTE", ln=True)
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 5, f"Nombre: {comprador.get('nombre', 'Consumidor Final')}", ln=True)
    pdf.cell(0, 5, f"Identificacion: {comprador.get('identificacion', '9999999999999')}", ln=True)
    pdf.ln(5)

    pdf.set_font("Helvetica", "B", 8)
    pdf.cell(80, 7, "Producto", border=1)
    pdf.cell(20, 7, "Cant.", border=1, align="C")
    pdf.cell(25, 7, "P.Unit.", border=1, align="C")
    pdf.cell(20, 7, "Desc.", border=1, align="C")
    pdf.cell(20, 7, "IVA", border=1, align="C")
    pdf.cell(25, 7, "Total", border=1, align="C")
    pdf.ln()

    pdf.set_font("Helvetica", "", 8)
    for item in items:
        nombre = item.get("nombre", "")[:40]
        pdf.cell(80, 6, nombre, border=1)
        pdf.cell(20, 6, f"{item.get('cantidad', 0)}", border=1, align="C")
        pdf.cell(25, 6, f"${item.get('precio_unitario', 0):.2f}", border=1, align="C")
        pdf.cell(20, 6, f"${item.get('descuento', 0):.2f}", border=1, align="C")
        pdf.cell(20, 6, f"${item.get('iva', 0):.2f}", border=1, align="C")
        pdf.cell(25, 6, f"${item.get('total', 0):.2f}", border=1, align="C")
        pdf.ln()

    pdf.ln(5)
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(145, 6, "Subtotal sin IVA:", align="R")
    pdf.cell(25, 6, f"${invoice.get('subtotal_sin_iva', 0):.2f}", align="R")
    pdf.ln()
    pdf.cell(145, 6, "Subtotal 0%:", align="R")
    pdf.cell(25, 6, f"${invoice.get('subtotal_0', 0):.2f}", align="R")
    pdf.ln()
    pdf.cell(145, 6, "Subtotal 15%:", align="R")
    pdf.cell(25, 6, f"${invoice.get('subtotal_15', 0):.2f}", align="R")
    pdf.ln()
    pdf.cell(145, 6, "IVA:", align="R")
    pdf.cell(25, 6, f"${invoice.get('total_iva', 0):.2f}", align="R")
    pdf.ln()
    pdf.cell(145, 6, "Descuento:", align="R")
    pdf.cell(25, 6, f"${invoice.get('descuento', 0):.2f}", align="R")
    pdf.ln()
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(145, 8, "TOTAL:", align="R")
    pdf.cell(25, 8, f"${invoice.get('total', 0):.2f}", align="R")

    return pdf.output()
