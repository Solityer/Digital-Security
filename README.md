# 数智安行：图数据可信治理与智能流通平台

![Python](https://img.shields.io/badge/Python-3.11+-blue.svg) ![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green.svg) ![React](https://img.shields.io/badge/React-18+-61DAFB.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg) ![License](https://img.shields.io/badge/License-MIT-yellow.svg) ![Version](https://img.shields.io/badge/Version-1.0.0-orange.svg)

---

## 项目简介

**数智安行**（Digital-Security）是一个面向数据要素安全流通场景的综合治理平台，聚焦图结构数据的全生命周期可信管理。平台将差分隐私、零知识证明、可验证密码学等前沿技术整合进统一的工程框架，支持数据资产登记、隐私保护计算、加密路径查询、可验证神经网络推理、全链路审计等完整流程。面向金融联合风控、医疗数据协作、政务图谱共享等典型行业场景，在不泄露原始图数据的前提下，实现跨主体数据的安全流通与可信计算。

本平台在学术层面参考了五篇高水平研究论文（见 `原版文件/` 目录），将其中提出的 Graph-SDP、GCC-SDP、GS-LDP、NDKD、VPCS、zkGCN 等算法完整工程化落地，并通过交互式 Web 界面以动态可视化方式呈现算法的每一个关键步骤。平台采用前后端分离架构，后端基于 FastAPI + SQLAlchemy + SQLite，前端基于 React 18 + TypeScript + Vite + Tailwind CSS，全栈代码覆盖率高，具备生产级的接口规范与安全设计，是一套兼具学术深度与工程完整性的比赛演示系统。

---

## 系统架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        浏览器 / 评委终端                              │
│         React 18 · TypeScript · Vite · Tailwind CSS                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ 总览驾驶 │ │ 数据资产 │ │ 隐私计算 │ │ VPCS查询 │ │ zkGCN证  │  │
│  │  舱Dashboard│ │  登记   │ │  实验室  │ │ 加密路径 │ │ 明推理   │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│  │ 合约管理 │ │ 授权策略 │ │ 风险监控 │ │ 审计追踪 │               │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘               │
└───────────────────────┬─────────────────────────────────────────────┘
                        │ HTTP / REST / JSON
                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  FastAPI 后端  (port 8000)                           │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │ /api/assets│  │/api/privacy│  │ /api/vpcs  │  │ /api/zkgcn   │  │
│  └────────────┘  └─────┬──────┘  └─────┬──────┘  └──────┬───────┘  │
│  ┌────────────┐        │               │                 │           │
│  │/api/contracts        ▼               ▼                 ▼           │
│  │/api/authz  │  ┌─────────────────────────────────────────────┐    │
│  │/api/audit  │  │            算法引擎层 (Python)                │    │
│  │/api/risks  │  │  Graph-SDP │ GCC-SDP │ GS-LDP │ NDKD       │    │
│  │/api/demo   │  │  VPCS      │ zkGCN   │ metrics │ graph_utils│    │
│  └────────────┘  └─────────────────────────────────────────────┘    │
│                                    │                                  │
│                                    ▼                                  │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │          SQLite + SQLAlchemy ORM (11 数据表)                  │     │
│  │  users · assets · graph_snapshots · contracts               │     │
│  │  authorization_policies · audit_logs · privacy_tasks        │     │
│  │  vpcs_queries · zkgcn_proofs · risk_events · demo_scenarios │     │
│  └─────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 技术栈

| 层次 | 技术选型 | 说明 |
|------|---------|------|
| 前端框架 | React 18 + TypeScript | 组件化 UI，类型安全 |
| 前端构建 | Vite 5 | 极速热更新开发体验 |
| 前端样式 | Tailwind CSS | 原子化 CSS，响应式布局 |
| 图表可视化 | Recharts / D3.js | 算法结果曲线、图谱渲染 |
| 后端框架 | FastAPI 0.110+ | 异步高性能，自动生成 OpenAPI 文档 |
| 数据库 ORM | SQLAlchemy 2.0 (async) | 11 张数据表，完整关系映射 |
| 数据库 | SQLite | 开箱即用，无需额外配置 |
| 数据验证 | Pydantic v2 | 请求/响应 schema 严格校验 |
| 算法实现 | NumPy / SciPy | 差分隐私、图算法核心计算 |
| 密码学模拟 | hashlib / hmac | HMAC 验证、哈希链审计日志 |
| 认证 | JWT (python-jose) | Token 鉴权，RBAC 角色控制 |
| 容器化 | 无依赖（直接运行） | Python 3.11+ / Node 18+ 即可 |

---

## 快速开始

### 环境要求

- Python 3.11+
- Node.js 18+
- pip / npm

### 启动后端

```bash
cd /home/match/Digital-Security/backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 启动前端（另一个终端）

```bash
cd /home/match/Digital-Security/frontend
npm install && npm run dev
```

### 或者一键启动

```bash
bash scripts/dev.sh
```

启动后访问：
- 前端界面：http://127.0.0.1:3000
- 系统诊断：http://127.0.0.1:3000/diagnostics
- 后端 API 文档：http://localhost:8000/docs
- 健康检查：http://localhost:8000/health

### 一键停止、检查与烟雾验收

```bash
bash scripts/stop.sh
bash scripts/check.sh
bash scripts/smoke_api.sh
```

- `scripts/check.sh` 会同时生成 `logs/check.log` 与 `logs/network-diagnosis.log`
- `scripts/smoke_api.sh` 会生成 `logs/smoke-api.log`，覆盖隐私算法、VPCS、zkGCN、风险、审计和场景接口

### 外部访问 / WSL / 局域网说明

- 前端 dev server 固定运行在 `0.0.0.0:3000`
- 后端运行在 `0.0.0.0:8000`
- 本机访问优先使用 `http://127.0.0.1:3000`
- 局域网访问可通过 `hostname -I` 查询本机 IP，并使用 `http://<你的IP>:3000`
- 如果在 WSL 或远程 Linux 环境中访问失败，优先检查宿主机防火墙、端口转发和代理设置

### 推荐验收命令

```bash
cd /home/match/Digital-Security/backend
.venv/bin/python -m compileall app
.venv/bin/python -m pytest tests/ -v

cd /home/match/Digital-Security/frontend
npm run build

cd /home/match/Digital-Security
bash scripts/stop.sh
bash scripts/dev.sh
bash scripts/check.sh
bash scripts/smoke_api.sh
curl -I http://127.0.0.1:3000
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/api/assets
curl http://127.0.0.1:8000/health
```

### 故障排查

- 接口契约说明见 `docs/API_CONTRACT_CHECK.md`
- 常见运行问题见 `docs/TROUBLESHOOTING.md`
- 实时日志见 `logs/backend-dev.log`、`logs/frontend-dev.log`

---

## 演示账号

| 账号 | 密码 | 角色 | 权限说明 |
|------|------|------|---------|
| admin | admin123 | 管理员 | 全平台管理权限，可查看所有数据、运行所有算法 |
| demo | demo123 | 演示用户 | 只读+演示权限，适合比赛现场展示 |

---

## 功能模块说明

### 1. 总览驾驶舱（Dashboard）
平台数据资产总量、风险告警数、隐私计算任务数、合约活跃数等核心指标实时展示，提供平台全局状态的一目了然视图，是演示的第一入口。

### 2. 数据资产登记（Data Assets）
支持图数据资产的在线登记，涵盖资产名称、行业分类（金融/医疗/政务/社交）、敏感等级、合规标签、数据所有权凭证、资产 Hash 上链记录等完整元数据管理，同时关联图快照（节点/边列表）以供后续算法调用。

### 3. 隐私计算实验室（Privacy Lab）
集成四大图差分隐私算法（Graph-SDP、GCC-SDP、GS-LDP、NDKD），支持在线参数调节（隐私预算 ε、k 值等），可视化展示原始分布、加噪分布、校正分布三条曲线，并逐步解析每个算法环节，兼顾学术严谨与演示直观。

### 4. 加密路径查询 VPCS（VPCS Query）
模拟 GO/CS/Proxy/QU 四角色协议交互，对加密图进行约束最短路径查询（含多维约束：距离、费用、时间、预算），展示哑边加密与 HMAC 验证全流程，并内置"篡改攻击演示"以直观展示可验证性的防护效果。

### 5. 可验证推理 zkGCN（ZK-GCN）
对图卷积网络（GCN）的推理过程构建零知识证明，展示 fixed-point 量化、R1CS 约束矩阵构造、Groth16 风格证明生成与验证的完整步骤，内置"参数篡改演示"以展示证明失效的对比效果。

### 6. 合约管理（Contracts）
数据共享合约全生命周期管理（草稿→待签→生效→暂停→终止），记录数据提供方、消费方、授权算法清单、隐私预算限额、有效期等合约要素，并生成合约 Hash 用于存证。

### 7. 授权策略（Authorization）
RBAC（基于角色）与 ABAC（基于属性）双重授权策略管理，支持对特定用户、资产、合约绑定细粒度操作权限，为数据安全流通提供策略层保障。

### 8. 风险监控（Risk Monitor）
实时检测异常访问、未授权操作、预算超支、授权过期、验证失败、数据质量等六类风险事件，输出风险评分（低/中/高/严重），支持事件状态管理（开放→调查中→已解决）。

### 9. 审计追踪（Audit Trail）
全平台操作行为写入哈希链式不可篡改审计日志，每条日志记录前驱哈希值形成链式结构，提供链完整性一键校验功能，并内置"篡改演示"以展示任意节点被篡改后链条断裂的告警效果。

---

## 算法模块说明

| 算法 | 文件 | 学术来源 | 简介 |
|------|------|---------|------|
| Graph-SDP | `algorithms/graph_sdp.py` | 丁红发等（2022） | Encode-Shuffle-Analyze 框架，k-RR 局部扰动 + 混洗 + MLE 校正，发布度分布直方图 |
| GCC-SDP | `algorithms/gcc_sdp.py` | 傅培旺等（2022） | 拉普拉斯机制 + 邻居扰动，发布图聚类系数 |
| GS-LDP | `algorithms/gs_ldp.py` | 傅培旺等（2023） | 对称一元编码（SUC）+ 随机响应，本地差分隐私下联合采集度分布、三角计数、聚类系数 |
| NDKD | `algorithms/ndkd.py` | 丁红发等（2023） | 邻居子图扰动 + 度序列匿名分组 + 图重构，输出 k-度匿名图 |
| VPCS | `algorithms/vpcs.py` | VPCS 论文 | GO/CS/Proxy/QU 四角色协议，哑边加密 + HMAC 验证，实现加密图上的可验证约束最短路径查询 |
| zkGCN | `algorithms/zkgcn.py` | zkGCN 论文 | GCN 前向推理 + fixed-point 量化 + R1CS 约束构造 + Groth16 风格证明，实现图神经网络推理零知识可验证 |

---

## API 文档

后端启动后访问：**http://localhost:8000/docs**（Swagger UI）

或访问 **http://localhost:8000/redoc**（ReDoc 风格）

全部接口均遵循 OpenAPI 3.1 规范，涵盖请求/响应 schema、参数说明、状态码定义。

---

## 项目结构

```
Digital-Security/
├── README.md                  # 本文件
├── ARCHITECTURE.md            # 系统架构详细说明
├── DEMO_SCRIPT.md             # 比赛演示讲解词
├── COMPETITION_HIGHLIGHTS.md  # 比赛亮点与创新点
│
├── 原版文件/                   # 参考学术论文（PDF）
│   ├── 混洗差分隐私保护的度分布直方图发布算法_丁红发.pdf
│   ├── 基于本地差分隐私的分布式图统计采集算法_傅培旺__.pdf
│   ├── 基于差分隐私的图数据发布隐私保护模型研究_傅培旺.pdf
│   ├── 邻居子图扰动下的k-度匿名隐私保护模型_丁红发.pdf
│   ├── VPCS Verifiable Query Scheme for Privacy-preserving
│   │   Constrained Shortest Path over Encrypted Graph Data.pdf
│   └── zkGCN Zero-Knowledge Proofs of Inference for
│       Graph Convolutional Networks.pdf
│
├── backend/                   # FastAPI 后端
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py            # 应用入口，路由注册
│   │   ├── database.py        # 数据库连接与初始化
│   │   ├── models.py          # SQLAlchemy ORM 模型（11张表）
│   │   ├── schemas.py         # Pydantic 请求/响应 schema
│   │   ├── algorithms/        # 算法引擎
│   │   │   ├── graph_sdp.py   # Graph-SDP 度分布隐私发布
│   │   │   ├── gcc_sdp.py     # GCC-SDP 聚类系数隐私发布
│   │   │   ├── gs_ldp.py      # GS-LDP 分布式图统计 LDP
│   │   │   ├── ndkd.py        # NDKD k-度匿名
│   │   │   ├── vpcs.py        # VPCS 可验证加密路径查询
│   │   │   ├── zkgcn.py       # zkGCN 零知识推理证明
│   │   │   ├── graph_utils.py # 图工具函数
│   │   │   └── metrics.py     # 效用度量指标
│   │   ├── api/               # REST 接口层
│   │   │   ├── assets.py      # 数据资产 CRUD
│   │   │   ├── contracts.py   # 合约管理
│   │   │   ├── authz.py       # 授权策略
│   │   │   ├── audit.py       # 审计日志
│   │   │   ├── privacy.py     # 隐私计算任务
│   │   │   ├── vpcs.py        # VPCS 查询接口
│   │   │   ├── zkgcn.py       # zkGCN 证明接口
│   │   │   ├── risks.py       # 风险事件
│   │   │   └── demo.py        # 行业场景演示
│   │   ├── services/          # 业务服务层
│   │   │   ├── audit_service.py
│   │   │   └── risk_service.py
│   │   └── seed/              # 数据库种子数据
│   └── tests/                 # 单元/集成测试
│
├── frontend/                  # React 前端
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── src/
│       ├── main.tsx           # 应用入口
│       ├── App.tsx            # 路由配置
│       ├── pages/             # 页面组件
│       │   ├── Dashboard.tsx      # 总览驾驶舱
│       │   ├── DataAssets.tsx     # 数据资产登记
│       │   ├── PrivacyLab.tsx     # 隐私计算实验室
│       │   ├── VPCSQuery.tsx      # VPCS 加密路径查询
│       │   ├── ZKGCNPage.tsx      # zkGCN 可验证推理
│       │   ├── Contracts.tsx      # 合约管理
│       │   ├── AuditTrail.tsx     # 审计追踪
│       │   ├── RiskMonitor.tsx    # 风险监控
│       │   └── ScenarioDemo.tsx   # 行业场景演示
│       ├── components/        # 公共组件
│       │   ├── Layout.tsx
│       │   ├── Sidebar.tsx
│       │   ├── StatCard.tsx
│       │   ├── StepTimeline.tsx
│       │   └── LoadingSpinner.tsx
│       ├── visualizations/    # 图表可视化组件
│       └── styles/            # 全局样式
│
├── scripts/                   # 启动与验收脚本
│   ├── dev.sh                 # 一键启动前后端
│   ├── stop.sh                # 停止前后端进程
│   ├── check.sh               # 健康检查 + 网络诊断
│   └── smoke_api.sh           # 核心接口烟雾验收
│
└── data/                      # 示例数据
```

---

## 依赖的原版文件说明

`原版文件/` 目录存放了本平台算法实现所参考的全部学术论文原文：

1. **混洗差分隐私保护的度分布直方图发布算法（丁红发等）** — Graph-SDP 算法来源，提出 Encode-Shuffle-Analyze 框架将本地差分隐私与混洗机制结合以提升度分布发布精度。

2. **基于本地差分隐私的分布式图统计采集算法（傅培旺等）** — GS-LDP 算法来源，提出对称一元编码（SUC）方案，在用户本地扰动前提下联合采集多种图统计量。

3. **基于差分隐私的图数据发布隐私保护模型研究（傅培旺等）** — GCC-SDP 算法来源，综合研究了拉普拉斯机制在图聚类系数发布中的应用。

4. **邻居子图扰动下的k-度匿名隐私保护模型（丁红发等）** — NDKD 算法来源，通过邻居子图扰动与 k-度匿名分组重构匿名图。

5. **VPCS: Verifiable Query Scheme for Privacy-preserving Constrained Shortest Path over Encrypted Graph Data** — VPCS 协议来源，四角色协议实现加密图上的可验证约束最短路径查询。

6. **zkGCN: Zero-Knowledge Proofs of Inference for Graph Convolutional Networks** — zkGCN 来源，基于 R1CS/Groth16 实现 GCN 推理过程的零知识可验证性。

另有 `数智安行计划书（终版）.docx` 为本平台的完整设计文档，包含系统需求分析、技术选型依据与部署方案。

---

## 比赛演示路线

推荐评委按以下顺序体验平台（约 6 分钟）：

```
总览驾驶舱
    ↓
数据资产登记 → 查看图快照（金融交易图谱）
    ↓
隐私计算实验室 → Graph-SDP（ε=1.0）→ 查看三条分布曲线
                → NDKD（k=3）→ 查看匿名图输出
    ↓
VPCS 加密路径查询 → 四角色交互 → 攻击篡改演示
    ↓
zkGCN 可验证推理 → 证明生成 → 参数篡改演示
    ↓
行业场景演示 → 金融联合风控一键演示
    ↓
审计追踪 → 哈希链验证 → 篡改演示
```

详细讲解词见 `DEMO_SCRIPT.md`。

---

## 注意事项

1. **密码学模块为演示实现**：VPCS 的加密操作、zkGCN 的零知识证明均为算法逻辑的模拟实现（使用 HMAC/SHA256 代替真实 ZK 证明系统），用于展示协议流程与安全属性，生产环境须替换为完整密码学库（如 snarkjs、bellman）。

2. **数据库初始化**：首次启动后端时，`init_db()` 会自动创建所有数据表并写入种子数据，无需手动迁移。

3. **CORS 配置**：后端当前允许全部来源（`allow_origins=["*"]`），仅适用于开发/演示环境，生产部署须限制来源。

4. **隐私预算建议**：演示时 ε 推荐取 0.5～2.0，过小（如 0.1）会导致噪声极大、曲线失真，不利于展示效用保持效果。

5. **SQLite 并发限制**：SQLite 不支持高并发写入，本平台定位为演示/原型系统，如需生产级部署建议替换为 PostgreSQL。
