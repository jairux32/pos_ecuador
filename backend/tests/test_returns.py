import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://127.0.0.1:8000")

def test_returns():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@sistema.com", "password": "Admin123!"
    })
    assert r.status_code == 200
    session = requests.Session()
    session.headers.update({"Cookie": r.headers.get("set-cookie", "")})

    r = session.post(f"{BASE_URL}/api/invoices/annul", json={"invoice_id": "missing", "motivo": "Test"})
    assert r.status_code == 404
