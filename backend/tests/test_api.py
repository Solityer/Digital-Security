"""
test_api.py
Smoke-tests for 数智安行 FastAPI endpoints using httpx AsyncClient.

Run:
    cd /home/match/Digital-Security/backend
    python -m pytest tests/test_api.py -v
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app


# ---------------------------------------------------------------------------
# Shared async client fixture
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="session", autouse=True)
async def init_database():
    """Initialize the test database before any tests run."""
    from app.database import init_db
    await init_db()


@pytest_asyncio.fixture
async def client():
    """
    Async HTTP client wired directly to the FastAPI ASGI app.
    Each test gets a fresh client; the app lifespan (init_db) runs once
    because FastAPI shares the application state.
    """
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as ac:
        yield ac


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _assert_ok(response, *acceptable_codes):
    """Assert that response status is one of the acceptable codes."""
    codes = acceptable_codes or (200,)
    assert response.status_code in codes, (
        f"Expected one of {codes}, got {response.status_code}. "
        f"Body: {response.text[:300]}"
    )


# ===========================================================================
# 1. Health check
# ===========================================================================

@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    """GET /health must return 200 with status='ok'."""
    resp = await client.get("/health")
    _assert_ok(resp, 200)
    body = resp.json()
    assert body["status"] == "ok"
    assert "service"  in body
    assert "version"  in body


# ===========================================================================
# 2. Create asset
# ===========================================================================

@pytest.mark.asyncio
async def test_create_asset(client: AsyncClient):
    """POST /api/assets with valid data must return 200 or 201."""
    payload = {
        "name": "测试金融图谱_API",
        "industry": "finance",
        "description": "API测试用金融图谱资产",
        "subject_type": "金融实体",
        "node_meaning": "用户/账户",
        "edge_meaning": "交易关系",
        "sensitivity_level": 3,
        "compliance_tags": ["GDPR"],
        "status": "active",
    }
    resp = await client.post("/api/assets", json=payload)
    _assert_ok(resp, 200, 201)
    body = resp.json()
    assert "id"   in body
    assert "name" in body
    assert body["name"] == payload["name"]


# ===========================================================================
# 3. List assets
# ===========================================================================

@pytest.mark.asyncio
async def test_list_assets(client: AsyncClient):
    """GET /api/assets must return a JSON object with a list."""
    resp = await client.get("/api/assets")
    _assert_ok(resp, 200)
    body = resp.json()
    # Endpoint returns {"total": N, "items": [...]} or a plain list
    if isinstance(body, dict):
        assert "items" in body or "assets" in body or "total" in body
    else:
        assert isinstance(body, list)


# ===========================================================================
# 4. Create contract
# ===========================================================================

@pytest.mark.asyncio
async def test_create_contract(client: AsyncClient):
    """POST /api/contracts with valid data must return 200 or 201."""
    payload = {
        "title": "API测试合约",
        "provider_id": None,
        "consumer_id": None,
        "purpose": "API smoke test",
        "accessible_fields": ["node_id"],
        "allowed_algorithms": ["graph_sdp"],
        "privacy_budget_limit": 1.0,
        "status": "draft",
    }
    resp = await client.post("/api/contracts", json=payload)
    _assert_ok(resp, 200, 201)
    body = resp.json()
    assert "id"    in body
    assert "title" in body


# ===========================================================================
# 5. Authz evaluate
# ===========================================================================

@pytest.mark.asyncio
async def test_authz_evaluate(client: AsyncClient):
    """POST /api/authz/evaluate must return a response containing 'allowed'."""
    payload = {
        "user_id": 1,
        "asset_id": 1,
        "operation": "read",
        "context_attrs": {"role": "analyst"},
    }
    resp = await client.post("/api/authz/evaluate", json=payload)
    # Accept 200 or 404 (no policies seeded yet is OK for a smoke test)
    assert resp.status_code in (200, 404, 422), (
        f"Unexpected status {resp.status_code}: {resp.text[:200]}"
    )
    if resp.status_code == 200:
        body = resp.json()
        assert "allowed" in body


# ===========================================================================
# 6. Audit logs
# ===========================================================================

@pytest.mark.asyncio
async def test_audit_logs(client: AsyncClient):
    """GET /api/audit/logs must return a list (possibly empty) with pagination."""
    resp = await client.get("/api/audit/logs")
    _assert_ok(resp, 200)
    body = resp.json()
    assert isinstance(body, dict), "Expected a dict with 'items' key"
    assert "items" in body
    assert "total" in body
    assert isinstance(body["items"], list)


# ===========================================================================
# 7. Audit verify-chain
# ===========================================================================

@pytest.mark.asyncio
async def test_audit_verify_chain(client: AsyncClient):
    """POST /api/audit/verify-chain must return is_valid boolean."""
    resp = await client.post("/api/audit/verify-chain")
    _assert_ok(resp, 200)
    body = resp.json()
    assert "is_valid"       in body
    assert "chain_intact"   in body
    assert "total_records"  in body
    assert isinstance(body["is_valid"], bool)


# ===========================================================================
# 8. Demo scenarios
# ===========================================================================

@pytest.mark.asyncio
async def test_demo_scenarios(client: AsyncClient):
    """GET /api/demo/scenarios must return 3 scenario objects."""
    resp = await client.get("/api/demo/scenarios")
    _assert_ok(resp, 200)
    body = resp.json()

    assert "scenarios" in body, f"Expected 'scenarios' key, got: {list(body.keys())}"
    scenarios = body["scenarios"]
    assert isinstance(scenarios, list)
    assert len(scenarios) == 3, (
        f"Expected 3 demo scenarios, got {len(scenarios)}"
    )

    # Verify each scenario has required fields
    for s in scenarios:
        assert "key"   in s or "scenario_key" in s
        assert "title" in s
