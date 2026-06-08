from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
import os
import logging

from database import db, client
from auth import hash_password, verify_password
from utils.storage import init_storage

from routes.auth_routes import router as auth_router
from routes.business_routes import router as business_router
from routes.inventory_routes import router as inventory_router
from routes.pos_routes import router as pos_router
from routes.invoice_routes import router as invoice_router
from routes.user_routes import router as user_router
from routes.reports_routes import router as reports_router
from routes.suppliers_routes import router as suppliers_router
from routes.audit_routes import router as audit_router
from routes.transfer_routes import router as transfer_router

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Sistema POS Ecuador", version="1.0.0")

frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")

# Allow multiple origins for local network access
allowed_origins = [
    frontend_url,
    "http://localhost:3000",
    "http://localhost:3001",
    "http://192.168.1.36:3000",
    "http://192.168.1.36:3001",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(business_router)
app.include_router(inventory_router)
app.include_router(pos_router)
app.include_router(invoice_router)
app.include_router(user_router)
app.include_router(reports_router)
app.include_router(suppliers_router)
app.include_router(audit_router)
app.include_router(transfer_router)


@app.get("/api")
async def root():
    return {"message": "Sistema POS Ecuador API v1.0"}


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.on_event("startup")
async def startup():
    logger.info("Starting POS Ecuador system...")

    await db.users.create_index("email", unique=True)
    await db.businesses.create_index("ruc", unique=True)
    await db.businesses.create_index("id")
    await db.branches.create_index("business_id")
    await db.products.create_index([("business_id", 1), ("is_active", 1)])
    await db.products.create_index([("business_id", 1), ("codigo_barras", 1)])
    await db.products.create_index([("business_id", 1), ("nombre", "text")])
    await db.sales.create_index([("business_id", 1), ("created_at", -1)])
    await db.invoices.create_index([("business_id", 1), ("created_at", -1)])
    await db.categories.create_index("business_id")
    await db.clients.create_index("business_id")
    await db.login_attempts.create_index("identifier")
    await db.inventory_movements.create_index([("business_id", 1), ("created_at", -1)])
    await db.suppliers.create_index([("business_id", 1), ("ruc", 1)])
    await db.purchase_orders.create_index([("business_id", 1), ("created_at", -1)])
    await db.audit_logs.create_index([("business_id", 1), ("created_at", -1)])
    await db.stock_transfers.create_index([("business_id", 1), ("created_at", -1)])

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@sistema.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin123!")

    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        hashed = hash_password(admin_password)
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hashed,
            "name": "Administrador",
            "role": "superadmin",
            "business_id": None,
            "branch_ids": [],
            "is_active": True,
            "created_at": "2025-01-01T00:00:00+00:00"
        })
        logger.info(f"Admin user seeded: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}}
        )
        logger.info("Admin password updated")

    try:
        init_storage()
    except Exception as e:
        logger.warning(f"Storage init warning: {e}")

    import os as _os
    creds_dir = _os.environ.get("CREDENTIALS_DIR", "/app/memory")
    try:
        _os.makedirs(creds_dir, exist_ok=True)
        with open(f"{creds_dir}/test_credentials.md", "w") as f:
            f.write(f"# Test Credentials\n\n")
            f.write(f"## Admin Account\n")
            f.write(f"- Email: {admin_email}\n")
            f.write(f"- Password: {admin_password}\n")
            f.write(f"- Role: superadmin\n\n")
            f.write(f"## Auth Endpoints\n")
            f.write(f"- POST /api/auth/login\n")
            f.write(f"- POST /api/auth/register\n")
            f.write(f"- GET /api/auth/me\n")
            f.write(f"- POST /api/auth/logout\n")
            f.write(f"- POST /api/auth/refresh\n")
    except Exception as e:
        logger.warning(f"Could not write test credentials file: {e}")

    logger.info("POS Ecuador system started successfully")


@app.on_event("shutdown")
async def shutdown():
    client.close()
