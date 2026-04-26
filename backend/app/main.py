"""
数智安行 – FastAPI application entry point.

Registers all sub-routers, configures CORS, attaches lifecycle hooks, and
exposes a simple /health endpoint.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.schemas import HealthResponse


# ---------------------------------------------------------------------------
# Lifespan (replaces deprecated @app.on_event)
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:  # noqa: ARG001
    """Initialise the database on startup; nothing special on shutdown."""
    await init_db()
    yield


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------


app = FastAPI(
    title="数智安行 API",
    summary="数据要素安全流通与隐私保护治理平台",
    description=(
        "**数智安行**（Digital-Security）是面向数据要素安全流通的综合治理平台，"
        "提供以下核心能力：\n\n"
        "- **数据资产管理**：资产登记、图谱快照、确权存证\n"
        "- **合约与授权**：数据共享合约全生命周期管理、RBAC/ABAC 动态授权\n"
        "- **隐私保护计算**：Graph-SDP、GCC-SDP、GS-LDP、NDKD 图差分隐私算法\n"
        "- **可验证隐私路径**：VPCS 最短路径查询与零知识证明验证\n"
        "- **ZK-GCN 推理证明**：图神经网络推理结果的零知识可验证性\n"
        "- **全链路审计**：哈希链式不可篡改日志，支持完整性校验\n"
        "- **风险感知**：实时风险事件检测、评分与响应\n"
        "- **行业演示场景**：金融、医疗、政务三大典型场景一键演示\n"
    ),
    version="1.0.0",
    contact={
        "name": "数智安行研发团队",
        "email": "security-platform@example.com",
    },
    license_info={
        "name": "MIT",
    },
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# CORS – allow all origins for demo / development
# ---------------------------------------------------------------------------


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Sub-routers
#
# Each module under app/api/ exposes a `router` object.  We import them here
# so that the rest of the codebase never needs to touch main.py when a new
# endpoint is added to an existing sub-module.
# ---------------------------------------------------------------------------


def _register_routers() -> None:
    """Import and include all API sub-routers."""

    # Assets
    from app.api.assets import router as assets_router  # noqa: PLC0415

    app.include_router(assets_router, prefix="/api/assets", tags=["Assets"])

    # Contracts
    from app.api.contracts import router as contracts_router  # noqa: PLC0415

    app.include_router(contracts_router, prefix="/api/contracts", tags=["Contracts"])

    # Authorisation
    from app.api.authz import router as authz_router  # noqa: PLC0415

    app.include_router(authz_router, prefix="/api/authz", tags=["Authorization"])

    # Audit
    from app.api.audit import router as audit_router  # noqa: PLC0415

    app.include_router(audit_router, prefix="/api/audit", tags=["Audit"])

    # Privacy algorithms
    from app.api.privacy import router as privacy_router  # noqa: PLC0415

    app.include_router(privacy_router, prefix="/api/privacy", tags=["Privacy"])

    # Verifiable Private Constrained Shortest-path
    from app.api.vpcs import router as vpcs_router  # noqa: PLC0415

    app.include_router(vpcs_router, prefix="/api/vpcs", tags=["VPCS"])

    # ZK-GCN proofs
    from app.api.zkgcn import router as zkgcn_router  # noqa: PLC0415

    app.include_router(zkgcn_router, prefix="/api/zkgcn", tags=["ZK-GCN"])

    # Risk events
    from app.api.risks import router as risks_router  # noqa: PLC0415

    app.include_router(risks_router, prefix="/api/risks", tags=["Risks"])

    # Demo scenarios
    from app.api.demo import router as demo_router  # noqa: PLC0415

    app.include_router(demo_router, prefix="/api/demo", tags=["Demo"])


_register_routers()


# ---------------------------------------------------------------------------
# Core endpoints
# ---------------------------------------------------------------------------


@app.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description="Returns service liveness status.  No authentication required.",
    tags=["System"],
)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="数智安行 API",
        version="1.0.0",
    )
