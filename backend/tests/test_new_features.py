"""Backend tests for new features: Reports, Suppliers, Inventory Import.
Uses existing owner@mitienda.com (has business with 1 product + 1 sale).
"""
import io
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://factura-sistema-1.preview.emergentagent.com").rstrip("/")
OWNER_EMAIL = "owner@mitienda.com"
OWNER_PASSWORD = "Owner123!"


# === Fixtures ===
@pytest.fixture(scope="module")
def owner_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": OWNER_EMAIL, "password": OWNER_PASSWORD
    })
    if r.status_code != 200:
        pytest.skip(f"Owner login failed: {r.status_code} {r.text}")
    return s


@pytest.fixture(scope="module")
def state():
    return {}


# === Reports ===
class TestReports:
    def test_sales_summary(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/reports/sales-summary")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["total_ventas", "total_iva", "num_ventas", "promedio_venta", "por_metodo_pago", "chart_diario"]:
            assert k in d
        assert isinstance(d["chart_diario"], list)

    def test_sales_by_category(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/reports/sales-by-category")
        assert r.status_code == 200, r.text
        assert "categories" in r.json()

    def test_sales_by_product(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/reports/sales-by-product?limit=10")
        assert r.status_code == 200, r.text
        assert "products" in r.json()

    def test_sales_by_vendor(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/reports/sales-by-vendor")
        assert r.status_code == 200, r.text
        assert "vendors" in r.json()

    def test_inventory_valuation(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/reports/inventory-valuation")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["total_productos", "total_items", "valor_costo", "valor_venta", "margen_bruto", "por_categoria"]:
            assert k in d

    def test_invoices_summary(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/reports/invoices-summary")
        assert r.status_code == 200, r.text

    def test_cash_register_history(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/reports/cash-register-history")
        assert r.status_code == 200, r.text
        assert "registers" in r.json()

    def test_export_sales_excel(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/reports/export/sales-excel")
        assert r.status_code == 200, r.text
        ct = r.headers.get("Content-Type", "")
        assert "spreadsheet" in ct or "officedocument" in ct
        # xlsx magic = PK zip header
        assert r.content[:2] == b"PK"
        assert len(r.content) > 100

    def test_export_inventory_excel(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/reports/export/inventory-excel")
        assert r.status_code == 200, r.text
        assert r.content[:2] == b"PK"

    def test_export_sales_pdf(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/reports/export/sales-pdf")
        assert r.status_code == 200, r.text
        assert r.content[:4] == b"%PDF"
        assert "application/pdf" in r.headers.get("Content-Type", "")


# === Suppliers CRUD ===
class TestSuppliers:
    def test_create_supplier(self, owner_session, state):
        # Valid Ecuador juridical RUC test (10-digit cedula + 001). Use known valid
        body = {
            "ruc": "1792060346001",  # known valid juridical RUC
            "razon_social": "TEST Proveedor SA",
            "nombre_comercial": "TEST Prov",
            "contacto_nombre": "Contacto Test",
            "contacto_email": "prov@test.com",
            "condiciones_pago": "30 días"
        }
        r = owner_session.post(f"{BASE_URL}/api/suppliers/", json=body)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        assert d["ruc"] == body["ruc"]
        assert d["razon_social"] == body["razon_social"]
        assert "id" in d
        state["supplier_id"] = d["id"]

    def test_list_suppliers(self, owner_session, state):
        r = owner_session.get(f"{BASE_URL}/api/suppliers/")
        assert r.status_code == 200
        sups = r.json()["suppliers"]
        ids = [s["id"] for s in sups]
        assert state["supplier_id"] in ids

    def test_search_suppliers(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/suppliers/?search=TEST")
        assert r.status_code == 200
        assert len(r.json()["suppliers"]) >= 1

    def test_update_supplier(self, owner_session, state):
        sid = state["supplier_id"]
        r = owner_session.put(f"{BASE_URL}/api/suppliers/{sid}", json={
            "razon_social": "TEST Proveedor Updated"
        })
        assert r.status_code == 200, r.text
        assert r.json()["razon_social"] == "TEST Proveedor Updated"

    def test_duplicate_ruc_rejected(self, owner_session):
        r = owner_session.post(f"{BASE_URL}/api/suppliers/", json={
            "ruc": "1792060346001",
            "razon_social": "Duplicate"
        })
        assert r.status_code == 400


# === Purchase Orders + Receive Merchandise ===
class TestPurchaseOrders:
    def test_get_first_product(self, owner_session, state):
        r = owner_session.get(f"{BASE_URL}/api/inventory/products")
        assert r.status_code == 200
        products = r.json().get("products", [])
        if not products:
            pytest.skip("No products available in business")
        p = products[0]
        state["product_id"] = p["id"]
        state["product_name"] = p["nombre"]
        state["stock_before"] = p.get("stock_actual", 0)

    def test_create_purchase_order(self, owner_session, state):
        if "supplier_id" not in state or "product_id" not in state:
            pytest.skip("Need supplier and product")
        body = {
            "proveedor_id": state["supplier_id"],
            "items": [{
                "producto_id": state["product_id"],
                "producto_nombre": state["product_name"],
                "cantidad": 5,
                "precio_unitario": 1.50
            }],
            "notas": "Test order"
        }
        r = owner_session.post(f"{BASE_URL}/api/suppliers/purchase-orders", json=body)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        assert d["estado"] == "pendiente"
        assert d["total"] == 7.5
        state["order_id"] = d["id"]

    def test_list_purchase_orders(self, owner_session, state):
        r = owner_session.get(f"{BASE_URL}/api/suppliers/purchase-orders")
        assert r.status_code == 200
        d = r.json()
        ids = [o["id"] for o in d["orders"]]
        assert state["order_id"] in ids

    def test_receive_merchandise_updates_stock(self, owner_session, state):
        if "order_id" not in state:
            pytest.skip("No order")
        body = {
            "order_id": state["order_id"],
            "items_received": [{
                "producto_id": state["product_id"],
                "cantidad_recibida": 5
            }]
        }
        r = owner_session.post(f"{BASE_URL}/api/suppliers/receive-merchandise", json=body)
        assert r.status_code == 200, r.text

        # Verify stock increased
        r2 = owner_session.get(f"{BASE_URL}/api/inventory/products/{state['product_id']}")
        assert r2.status_code == 200
        new_stock = r2.json().get("stock_actual", 0)
        assert new_stock == state["stock_before"] + 5, f"stock {state['stock_before']} -> {new_stock}"

        # Verify order is now "recibida"
        r3 = owner_session.get(f"{BASE_URL}/api/suppliers/purchase-orders")
        order = next((o for o in r3.json()["orders"] if o["id"] == state["order_id"]), None)
        assert order is not None
        assert order["estado"] == "recibida"

    def test_purchase_history(self, owner_session, state):
        if "supplier_id" not in state:
            pytest.skip("no supplier")
        r = owner_session.get(f"{BASE_URL}/api/suppliers/purchase-history/{state['supplier_id']}")
        assert r.status_code == 200
        assert "orders" in r.json()


# === Inventory Import / Template ===
class TestInventoryImport:
    def test_export_template(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/inventory/export-template")
        assert r.status_code == 200, r.text
        assert r.content[:2] == b"PK"
        assert "spreadsheet" in r.headers.get("Content-Type", "") or "officedocument" in r.headers.get("Content-Type", "")

    def test_import_csv(self, owner_session, state):
        unique = uuid.uuid4().hex[:8].upper()
        csv_data = (
            "nombre,codigo_interno,precio_costo,precio_venta,stock_actual,categoria\n"
            f"TEST_IMP_A_{unique},TIA-{unique},1.00,2.00,50,Importados\n"
            f"TEST_IMP_B_{unique},TIB-{unique},2.50,4.00,20,Importados\n"
        )
        files = {"file": (f"products_{unique}.csv", csv_data.encode("utf-8"), "text/csv")}
        # Important: requests with multipart removes Content-Type from session
        s = owner_session
        r = s.post(f"{BASE_URL}/api/inventory/import-csv", files=files)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["imported"] == 2, d
        assert d["total_errors"] == 0

        # Verify products were created
        r2 = s.get(f"{BASE_URL}/api/inventory/products?search=TEST_IMP_A_{unique}")
        assert r2.status_code == 200
        prods = r2.json().get("products", [])
        assert any(p["nombre"] == f"TEST_IMP_A_{unique}" for p in prods)

    def test_import_csv_missing_nombre_rejected(self, owner_session):
        csv_data = "codigo,precio\nABC,1.00\n"
        files = {"file": ("bad.csv", csv_data.encode("utf-8"), "text/csv")}
        r = owner_session.post(f"{BASE_URL}/api/inventory/import-csv", files=files)
        assert r.status_code == 400


# === Cleanup ===
class TestZCleanup:
    def test_delete_supplier(self, owner_session, state):
        if "supplier_id" not in state:
            pytest.skip()
        r = owner_session.delete(f"{BASE_URL}/api/suppliers/{state['supplier_id']}")
        assert r.status_code == 200
