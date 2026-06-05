import logging

logger = logging.getLogger(__name__)

async def check_and_notify_low_stock(product: dict, business_id: str):
    """
    Checks if a product's stock is below the minimum and simulates an email notification.
    """
    try:
        stock_actual = product.get("stock_actual", 0)
        stock_minimo = product.get("stock_minimo", 0)

        if stock_actual <= stock_minimo:
            # Simulate sending email or SMS
            logger.info(f"NOTIFICATION: Low stock alert for product {product.get('nombre')} (ID: {product.get('id')}). Current: {stock_actual}, Min: {stock_minimo}")
            # In a real scenario, integrate SendGrid, Twilio, or AWS SES here
            return True
    except Exception as e:
        logger.error(f"Error checking stock for notification: {e}")
    return False

async def notify_invoice_generated(client_email: str, invoice_id: str):
    """
    Simulates sending an invoice (PDF/XML) to the client.
    """
    if not client_email:
        return False
    logger.info(f"NOTIFICATION: Sending invoice {invoice_id} to client {client_email} via Email/WhatsApp.")
    return True
