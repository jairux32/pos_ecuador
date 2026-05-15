"""Backend tests for Sistema POS Ecuador"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://factura-sistema-1.preview.emergentagent.com").rstrip("/")

# Pre-computed valid Ecuador cedula+RUC for tests
VALID_CEDULA = "1714616123"
VALID_RUC = "1714616123001"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_logged_in(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@sistema.com", "password": "Admin123!"
    })
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    return admin_session


# === Health & basic ===
class TestHealth:
    def test_health(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/health")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


# === Auth ===
class TestAuth:
    def test_login_admin(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@sistema.com", "password": "Admin123!"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["email"] == "admin@sistema.com"
        assert d["role"] == "superadmin"
        # httpOnly cookie
        assert "access_token" in admin_session.cookies

    def test_login_bad(self, admin_session):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@sistema.com", "password": "wrong!"
        })
        assert r.status_code == 401

    def test_me(self, admin_logged_in):
        r = admin_logged_in.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == "admin@sistema.com"


# === Business lookup endpoints ===
class TestBusinessLookups:
    def test_provinces(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/business/provinces")
        assert r.status_code == 200
        provs = r.json()["provinces"]
        assert "Pichincha" in provs
        assert "Quito" in provs["Pichincha"]

    def test_sectors(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/business/sectors")
        assert r.status_code == 200
        assert "Abarrotes" in r.json()["sectors"]

    def test_tax_regimes(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/business/tax-regimes")
        assert r.status_code == 200
        assert len(r.json()["regimes"]) >= 1

    def test_validate_ruc_valid(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/business/validate-ruc", json={"ruc": VALID_RUC})
        assert r.status_code == 200
        assert r.json()["valid"] is True

    def test_validate_ruc_invalid(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/business/validate-ruc", json={"ruc": "1234567890123"})
        assert r.status_code == 200
        assert r.json()["valid"] is False


# === Setup flow + tenant-scoped operations ===
@pytest.fixture(scope="module")
def tenant_context():
    """Create a new business+admin and return logged-in session w/ business."""
    unique = uuid.uuid4().hex[:6]
    admin_email = f"TEST_owner_{unique}@example.com"
    admin_password = "Owner123!"

    # Unauthenticated session for setup (endpoint has no auth requirement)
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})

    payload = {
        "business": {
            "nombre_comercial": f"TEST Tienda {unique}",
            "razon_social": f"TEST Razon {unique}",
            "ruc": VALID_RUC,
            "direccion_matriz": "Av. Amazonas y Naciones Unidas",
            "sector": "Abarrotes",
            "regimen_tributario": "RIMPE Emprendedor"
        },
        "branches": [{
            "nombre": "Matriz",
            "provincia": "Pichincha",
            "canton": "Quito",
            "direccion": "Av. Amazonas",
            "telefono": "022345678",
            "codigo_establecimiento": "001",
            "punto_emision": "001"
        }],
        "admin_email": admin_email,
        "admin_password": admin_password,
        "admin_name": "TEST Owner"
    }

    r = s.post(f"{BASE_URL}/api/business/setup", json=payload)
    if r.status_code == 400 and "RUC" in r.text:
        # RUC already used (from previous test run); clean & retry with same RUC is not possible
        # Fall back: assume previous owner exists; do a direct login won't work without their pw
        pytest.skip(f"Business already exists for RUC {VALID_RUC}: {r.text}")
    assert r.status_code == 200, f"setup failed: {r.status_code} {r.text}"
    setup = r.json()
    business_id = setup["business_id"]
    branch_id = setup["branch_ids"][0]

    # Login as new owner
    s2 = requests.Session()
    s2.headers.update({"Content-Type": "application/json"})
    r = s2.post(f"{BASE_URL}/api/auth/login", json={
        "email": admin_email, "password": admin_password
    })
    assert r.status_code == 200, r.text
    user = r.json()
    assert user["business_id"] == business_id

    return {
        "session": s2, "business_id": business_id,
        "branch_id": branch_id, "email": admin_email
    }


class TestSetupAndTenant:
    def test_setup_created(self, tenant_context):
        assert tenant_context["business_id"]
        assert tenant_context["branch_id"]

    def test_my_business(self, tenant_context):
        s = tenant_context["session"]
        r = s.get(f"{BASE_URL}/api/business/my-business")
        assert r.status_code == 200
        d = r.json()
        assert d["business"]["ruc"] == VALID_RUC
        assert len(d["branches"]) >= 1

    def test_setup_duplicate_ruc(self, tenant_context):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        payload = {
            "business": {
                "nombre_comercial": "Dup", "razon_social": "Dup",
                "ruc": VALID_RUC, "direccion_matriz": "x",
                "sector": "Abarrotes", "regimen_tributario": "RIMPE Emprendedor"
            },
            "branches": [{"nombre": "M", "provincia": "Pichincha", "canton": "Quito",
                          "direccion": "x", "telefono": "1", "codigo_establecimiento": "001",
                          "punto_emision": "001"}],
            "admin_email": f"TEST_dup_{uuid.uuid4().hex[:6]}@x.com",
            "admin_password": "Pass123!", "admin_name": "x"
        }
        r = s.post(f"{BASE_URL}/api/business/setup", json=payload)
        assert r.status_code == 400


# === Inventory CRUD ===
class TestInventory:
    def test_create_get_update_delete(self, tenant_context):
        s = tenant_context["session"]
        # Create
        payload = {
            "nombre": "TEST Coca Cola 500ml",
            "codigo_barras": "7861234560001",
            "precio_costo": 0.50, "precio_venta": 1.00,
            "iva_porcentaje": 15, "stock_actual": 100, "stock_minimo": 5
        }
        r = s.post(f"{BASE_URL}/api/inventory/products", json=payload)
        assert r.status_code == 200, r.text
        prod = r.json()
        assert prod["nombre"] == payload["nombre"]
        assert prod["stock_actual"] == 100
        pid = prod["id"]

        # GET list/search
        r = s.get(f"{BASE_URL}/api/inventory/products", params={"search": "Coca"})
        assert r.status_code == 200
        assert any(p["id"] == pid for p in r.json()["products"])

        # GET single
        r = s.get(f"{BASE_URL}/api/inventory/products/{pid}")
        assert r.status_code == 200
        assert r.json()["nombre"] == payload["nombre"]

        # UPDATE
        r = s.put(f"{BASE_URL}/api/inventory/products/{pid}", json={"precio_venta": 1.25})
        assert r.status_code == 200
        assert r.json()["precio_venta"] == 1.25

        # Verify persisted
        r = s.get(f"{BASE_URL}/api/inventory/products/{pid}")
        assert r.json()["precio_venta"] == 1.25

        # DELETE (soft)
        r = s.delete(f"{BASE_URL}/api/inventory/products/{pid}")
        assert r.status_code == 200
        r = s.get(f"{BASE_URL}/api/inventory/products/{pid}")
        # Soft delete: still findable since route doesn't filter is_active
        # but should not appear in active product list
        r = s.get(f"{BASE_URL}/api/inventory/products", params={"search": "Coca"})
        assert all(p["id"] != pid for p in r.json()["products"])


# === POS Sale + Cash Register ===
@pytest.fixture(scope="module")
def sale_id_holder():
    return {}


class TestPOS:
    def test_open_register(self, tenant_context):
        s = tenant_context["session"]
        r = s.post(f"{BASE_URL}/api/pos/open-register", json={
            "monto_inicial": 50.0, "branch_id": tenant_context["branch_id"]
        })
        assert r.status_code == 200, r.text
        assert r.json()["estado"] == "abierta"

    def test_dashboard_stats(self, tenant_context):
        s = tenant_context["session"]
        r = s.get(f"{BASE_URL}/api/pos/dashboard-stats")
        assert r.status_code == 200
        d = r.json()
        for k in ["total_products", "low_stock_count", "ventas_hoy", "num_ventas_hoy"]:
            assert k in d

    def test_full_sale(self, tenant_context, sale_id_holder):
        s = tenant_context["session"]
        # Create product to sell
        r = s.post(f"{BASE_URL}/api/inventory/products", json={
            "nombre": "TEST Producto Venta", "precio_costo": 1.0,
            "precio_venta": 10.0, "iva_porcentaje": 15,
            "stock_actual": 50, "stock_minimo": 1
        })
        assert r.status_code == 200, r.text
        prod = r.json()
        pid = prod["id"]

        # Sell 2 units. Total: 2*10=20, IVA 15% = 3, total=23
        sale_payload = {
            "items": [{
                "producto_id": pid, "nombre": prod["nombre"],
                "cantidad": 2, "precio_unitario": 10.0,
                "descuento": 0, "iva_porcentaje": 15
            }],
            "pagos": [{"metodo": "efectivo", "monto": 23.0}],
            "cliente": {"tipo_identificacion": "consumidor_final",
                        "nombre": "Consumidor Final"},
            "tipo_documento": "factura",
            "branch_id": tenant_context["branch_id"]
        }
        r = s.post(f"{BASE_URL}/api/pos/sell", json=sale_payload)
        assert r.status_code == 200, r.text
        sale = r.json()
        assert sale["total"] == 23.0
        assert sale["estado"] == "completada"
        sale_id_holder["sale_id"] = sale["id"]

        # Stock decremented
        r = s.get(f"{BASE_URL}/api/inventory/products/{pid}")
        assert r.json()["stock_actual"] == 48


# === Invoices ===
class TestInvoices:
    def test_generate_invoice(self, tenant_context, sale_id_holder):
        sale_id = sale_id_holder.get("sale_id")
        if not sale_id:
            pytest.skip("No sale to invoice")
        s = tenant_context["session"]
        r = s.post(f"{BASE_URL}/api/invoices/generate", json={
            "sale_id": sale_id, "tipo_documento": "01"
        })
        assert r.status_code == 200, r.text
        inv = r.json()
        assert len(inv["clave_acceso"]) == 49
        assert inv["numero_comprobante"].startswith("001-001-")
        sale_id_holder["invoice_id"] = inv["id"]

    def test_list_invoices(self, tenant_context):
        s = tenant_context["session"]
        r = s.get(f"{BASE_URL}/api/invoices/")
        assert r.status_code == 200
        assert "invoices" in r.json()

    def test_xml(self, tenant_context, sale_id_holder):
        iid = sale_id_holder.get("invoice_id")
        if not iid:
            pytest.skip("No invoice")
        s = tenant_context["session"]
        r = s.get(f"{BASE_URL}/api/invoices/{iid}/xml")
        assert r.status_code == 200
        assert "<?xml" in r.text
        assert "<factura" in r.text

    def test_pdf(self, tenant_context, sale_id_holder):
        iid = sale_id_holder.get("invoice_id")
        if not iid:
            pytest.skip("No invoice")
        s = tenant_context["session"]
        r = s.get(f"{BASE_URL}/api/invoices/{iid}/pdf")
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"


# === Users ===
class TestUsers:
    def test_create_and_update_user(self, tenant_context):
        s = tenant_context["session"]
        email = f"TEST_user_{uuid.uuid4().hex[:6]}@x.com"
        r = s.post(f"{BASE_URL}/api/users/", json={
            "email": email, "password": "User123!", "name": "TEST User",
            "role": "vendedor"
        })
        assert r.status_code == 200, r.text
        uid = r.json()["id"]

        # List
        r = s.get(f"{BASE_URL}/api/users/")
        assert r.status_code == 200
        emails = [u["email"] for u in r.json()["users"]]
        assert email.lower() in emails

        # Update role
        r = s.put(f"{BASE_URL}/api/users/{uid}", json={"role": "bodeguero"})
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "bodeguero"
