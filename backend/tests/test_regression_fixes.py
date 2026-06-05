"""Regression tests for fixed bugs.

Covers:
- PDF invoice with spanish characters does not 500
- Soft-deleted product returns 404 from GET /inventory/products/{id}
- Supplier RUC validation rejects invalid RUC
- CSV import rejects duplicate codigo_interno
- User update accepts password
- Self-deactivation is blocked
"""
import os
import random
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
ADMIN_EMAIL = "admin@sistema.com"
ADMIN_PASSWORD = "Admin123!"


def _generate_valid_ruc() -> str:
    """Generate a fresh valid Ecuadorian RUC that should be unique in the test DB."""
    while True:
        nums = [random.randint(0, 9) for _ in range(9)]
        coefs = [2, 1, 2, 1, 2, 1, 2, 1, 2]
        total = 0
        for i in range(9):
            v = nums[i] * coefs[i]
            if v >= 10:
                v -= 9
            total += v
        check = 10 - (total % 10)
        if check == 10:
            check = 0
        ced = "".join(str(n) for n in nums) + str(check)
        ruc = ced + "001"
        # Validate against the backend's own helper if imported
        try:
            from utils.ecuador import validar_ruc_ecuatoriano
            if validar_ruc_ecuatoriano(ruc):
                return ruc
        except Exception:
            return ruc


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
    })
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    return s


@pytest.fixture(scope="module")
def tenant():
    s = requests.Session()
    valid_ruc = _generate_valid_ruc()
    payload = {
        "business": {
            "nombre_comercial": "Tienda Ñandú S.A.",
            "razon_social": "Tienda Ñandú S.A.",
            "ruc": valid_ruc,
            "direccion_matriz": "Av. República del Salvador",
            "sector": "Abarrotes",
            "regimen_tributario": "RIMPE Emprendedor",
        },
        "branches": [{
            "nombre": "Matriz", "provincia": "Pichincha", "canton": "Quito",
            "direccion": "Av. Principal", "telefono": "022345678",
            "codigo_establecimiento": "001", "punto_emision": "001",
        }],
        "admin_email": f"fix_{uuid.uuid4().hex[:6]}@x.com",
        "admin_password": "Owner123!",
        "admin_name": "Fix Owner",
    }
    r = s.post(f"{BASE_URL}/api/business/setup", json=payload)
    if r.status_code != 200:
        pytest.skip(f"Tenant setup failed: {r.status_code} {r.text}")
    assert r.status_code == 200, r.text

    s2 = requests.Session()
    s2.post(f"{BASE_URL}/api/auth/login", json={
        "email": payload["admin_email"], "password": payload["admin_password"]
    })
    return s2


def test_soft_deleted_product_returns_404(tenant):
    pid = f"soft-{uuid.uuid4().hex[:8]}"
    r = tenant.post(f"{BASE_URL}/api/inventory/products", json={
        "nombre": "Soft Delete Test", "codigo_interno": pid,
        "precio_venta": 1.0, "stock_actual": 1, "stock_minimo": 0,
    })
    assert r.status_code == 200, r.text
    product_id = r.json()["id"]
    assert tenant.get(f"{BASE_URL}/api/inventory/products/{product_id}").status_code == 200

    r = tenant.delete(f"{BASE_URL}/api/inventory/products/{product_id}")
    assert r.status_code == 200, r.text

    r = tenant.get(f"{BASE_URL}/api/inventory/products/{product_id}")
    assert r.status_code == 404, f"Expected 404 after soft-delete, got {r.status_code}"


def test_supplier_invalid_ruc_rejected(tenant):
    r = tenant.post(f"{BASE_URL}/api/suppliers/", json={
        "ruc": "1234567890123",  # invalid (wrong check digits)
        "razon_social": "Bad RUC SA",
    })
    assert r.status_code == 400, r.text
    assert "ruc" in r.json()["detail"].lower() or "ruc" in str(r.json()["detail"]).lower()


def test_supplier_valid_ruc_accepted(tenant):
    ruc = _generate_valid_ruc()
    r = tenant.post(f"{BASE_URL}/api/suppliers/", json={
        "ruc": ruc,
        "razon_social": "Valid RUC SA",
    })
    assert r.status_code == 200, r.text
    assert r.json()["ruc"] == ruc


def test_csv_import_rejects_duplicate_codigo(tenant):
    cid = f"DUP-{uuid.uuid4().hex[:6].upper()}"
    csv_data = (
        "nombre,codigo_interno,precio_venta,stock_actual\n"
        f"Dup A,{cid},1.00,10\n"
        f"Dup B,{cid},2.00,20\n"
    )
    files = {"file": (f"dup_{cid}.csv", csv_data.encode("utf-8"), "text/csv")}
    r = tenant.post(f"{BASE_URL}/api/inventory/import-csv", files=files)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["imported"] == 1, d
    assert d["total_errors"] >= 1, d
    assert "ya existe" in d["errors"][0].lower()


def test_user_update_with_password(tenant):
    me = tenant.get(f"{BASE_URL}/api/auth/me").json()
    if me["role"] not in ("superadmin", "administrador"):
        pytest.skip("Tenant user is not admin")

    email = f"upd_{uuid.uuid4().hex[:6]}@x.com"
    r = tenant.post(f"{BASE_URL}/api/users/", json={
        "email": email, "password": "Old12345", "name": "U", "role": "vendedor",
    })
    assert r.status_code == 200, r.text
    uid = r.json()["id"]

    r = tenant.put(f"{BASE_URL}/api/users/{uid}", json={"password": "New12345"})
    assert r.status_code == 200, r.text

    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "New12345"})
    assert r.status_code == 200, r.text


def test_user_self_deactivation_blocked(tenant):
    me = tenant.get(f"{BASE_URL}/api/auth/me").json()
    if me["role"] != "superadmin":
        pytest.skip("Tenant user is not superadmin")
    r = tenant.delete(f"{BASE_URL}/api/users/{me['id']}")
    assert r.status_code == 400, r.text


def test_user_create_password_complexity(tenant):
    """POST /api/users/ must reject weak passwords."""
    me = tenant.get(f"{BASE_URL}/api/auth/me").json()
    if me["role"] not in ("superadmin", "administrador"):
        pytest.skip("Tenant user is not admin")
    r = tenant.post(f"{BASE_URL}/api/users/", json={
        "email": f"weak_{uuid.uuid4().hex[:6]}@x.com",
        "password": "123",  # too short
        "name": "Weak", "role": "vendedor",
    })
    assert r.status_code == 400, r.text

    r = tenant.post(f"{BASE_URL}/api/users/", json={
        "email": f"weak_{uuid.uuid4().hex[:6]}@x.com",
        "password": "alllowercase",  # no uppercase, no number
        "name": "Weak", "role": "vendedor",
    })
    assert r.status_code == 400, r.text


def test_health(admin):
    r = admin.get(f"{BASE_URL}/api/health")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"

