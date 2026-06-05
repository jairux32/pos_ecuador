from fastapi import APIRouter, Request, HTTPException
from typing import Optional
from datetime import datetime, timezone
import uuid
import stripe
import os
from database import db
from auth import get_current_user

router = APIRouter(prefix="/api/payments", tags=["payments"])

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "sk_test_dummy")

@router.post("/create-link")
async def create_payment_link(request: Request, body: dict):
    """
    Creates a payment link for a pending invoice or sale.
    body: { sale_id: str, amount: float, description: str }
    """
    user = await get_current_user(request)
    sale_id = body.get("sale_id")
    amount = body.get("amount")

    if not sale_id or not amount:
        raise HTTPException(status_code=400, detail="sale_id and amount are required")

    sale = await db.sales.find_one({"id": sale_id, "business_id": user["business_id"]})
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    try:
        # Mocking or creating actual stripe session if key is valid
        # We'll return a mock URL for testing purposes if dummy key is used
        if stripe.api_key == "sk_test_dummy":
            payment_url = f"https://mock-payment-gateway.com/pay/{uuid.uuid4().hex}"
        else:
            session = stripe.checkout.Session.create(
                payment_method_types=['card'],
                line_items=[{
                    'price_data': {
                        'currency': 'usd',
                        'product_data': {
                            'name': body.get("description", "Pago de Factura/Venta"),
                        },
                        'unit_amount': int(amount * 100),
                    },
                    'quantity': 1,
                }],
                mode='payment',
                success_url=f"{os.environ.get('FRONTEND_URL', 'http://localhost:3000')}/payment-success?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{os.environ.get('FRONTEND_URL', 'http://localhost:3000')}/payment-cancel",
            )
            payment_url = session.url

        # Store payment intent/link info in the sale document
        await db.sales.update_one(
            {"id": sale_id},
            {"$set": {
                "payment_link": payment_url,
                "payment_status": "pending_online_payment",
                "payment_updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )

        return {"payment_url": payment_url, "sale_id": sale_id}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
