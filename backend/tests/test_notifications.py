import pytest
from utils.notifications import check_and_notify_low_stock, notify_invoice_generated

@pytest.mark.asyncio
async def test_check_low_stock_triggers_notification():
    product = {"nombre": "Test", "id": "1", "stock_actual": 5, "stock_minimo": 10}
    res = await check_and_notify_low_stock(product, "b_1")
    assert res is True

@pytest.mark.asyncio
async def test_check_normal_stock_no_notification():
    product = {"nombre": "Test", "id": "1", "stock_actual": 15, "stock_minimo": 10}
    res = await check_and_notify_low_stock(product, "b_1")
    assert res is False

@pytest.mark.asyncio
async def test_notify_invoice():
    res = await notify_invoice_generated("test@test.com", "inv_1")
    assert res is True
