# 数智安行系统架构文档

版本：1.0.0 | 日期：2026-04-26

---

## 系统总体架构

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           客户端层（Browser）                              │
│                                                                            │
│   React 18 · TypeScript · Vite · Tailwind CSS · Recharts                 │
│                                                                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │  Dashboard  │  │  DataAssets │  │  PrivacyLab │  │   VPCSQuery     │ │
│  │  总览驾驶舱  │  │  数据资产   │  │  隐私计算   │  │  加密路径查询   │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │  ZKGCNPage  │  │  Contracts  │  │  AuditTrail │  │  RiskMonitor    │ │
│  │  可验证推理  │  │  合约管理   │  │  审计追踪   │  │  风险监控       │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘ │
│  ┌─────────────┐                                                          │
│  │ScenarioDemo │                                                          │
│  │行业场景演示  │                                                          │
│  └─────────────┘                                                          │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
                          HTTP / REST / JSON
                          (CORS: allow-all for demo)
                                   │
┌──────────────────────────────────▼───────────────────────────────────────┐
│                       服务端层（FastAPI · port 8000）                      │
│                                                                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │/api/     │ │/api/     │ │/api/     │ │/api/     │ │/api/         │  │
│  │assets    │ │contracts │ │authz     │ │audit     │ │privacy       │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────┬───────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐    │          │
│  │/api/vpcs │ │/api/zkgcn│ │/api/risks│ │/api/demo     │    │          │
│  └────┬─────┘ └────┬─────┘ └──────────┘ └──────────────┘    │          │
│       │             │                                          │          │
│       └─────────────┴──────────────────────────────────────── ┘          │
│                              算法引擎层                                    │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────┐ ┌──────┐ ┌──────────┐  │
│  │Graph-SDP│ │GCC-SDP  │ │GS-LDP   │ │NDKD  │ │VPCS  │ │zkGCN     │  │
│  └─────────┘ └─────────┘ └─────────┘ └──────┘ └──────┘ └──────────┘  │
│                              服务层                                        │
│         ┌──────────────────┐   ┌──────────────────┐                      │
│         │  audit_service   │   │  risk_service    │                      │
│         └──────────────────┘   └──────────────────┘                      │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
                          SQLAlchemy 2.0 (async)
                                   │
┌──────────────────────────────────▼───────────────────────────────────────┐
│                        数据持久层（SQLite）                                │
│                                                                            │
│  users · assets · graph_snapshots · contracts · authorization_policies   │
│  audit_logs · privacy_tasks · vpcs_queries · zkgcn_proofs                │
│  risk_events · demo_scenarios                                             │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 模块说明

| 模块名 | 功能描述 | 核心文件 | 关键技术 |
|--------|---------|---------|---------|
| 总览驾驶舱 | 平台核心指标聚合展示，实时呈现资产数量、风险告警、任务统计 | `pages/Dashboard.tsx` | React hooks, REST 聚合查询 |
| 数据资产管理 | 图数据资产登记、元数据管理、图快照绑定、资产 Hash 确权 | `api/assets.py`, `pages/DataAssets.tsx` | SQLAlchemy ORM, Pydantic schema |
| 合约管理 | 数据共享合约全生命周期（草稿→生效→终止），合约 Hash 存证 | `api/contracts.py`, `pages/Contracts.tsx` | 状态机, hashlib |
| 授权策略 | RBAC + ABAC 双模授权，细粒度操作权限绑定 | `api/authz.py` | 角色枚举, 属性键值策略 |
| 隐私计算实验室 | 四大图差分隐私算法在线执行，参数可调，结果可视化 | `api/privacy.py`, `algorithms/graph_sdp.py` 等 | NumPy, k-RR, Laplace, SUC |
| VPCS 加密路径查询 | 加密图四角色协议，约束最短路径查询，HMAC 可验证 | `api/vpcs.py`, `algorithms/vpcs.py` | HMAC-SHA256, Dijkstra, 哑边 |
| zkGCN 可验证推理 | GCN 推理 + R1CS 约束 + Groth16 风格证明生成与验证 | `api/zkgcn.py`, `algorithms/zkgcn.py` | fixed-point 量化, 矩阵乘法, SHA256 |
| 审计追踪 | 哈希链式不可篡改日志，支持完整性校验与篡改演示 | `api/audit.py`, `services/audit_service.py` | 哈希链, prev_hash 链接 |
| 风险监控 | 六类风险事件检测，风险评分，状态流转管理 | `api/risks.py`, `services/risk_service.py` | 枚举策略, 评分模型 |
| 行业场景演示 | 金融/医疗/政务三大场景一键演示，分步骤动画输出 | `api/demo.py`, `pages/ScenarioDemo.tsx` | 预置步骤配置, async 调度 |

---

## 数据库模型

### 1. User（用户）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer PK | 自增主键 |
| username | String(64) UNIQUE | 登录名 |
| email | String(256) UNIQUE | 邮箱 |
| role | Enum(admin/analyst/auditor/demo) | 角色 |
| hashed_password | String(256) | 哈希后密码 |
| is_active | Boolean | 账号是否启用 |
| created_at | DateTime | 创建时间 |

### 2. Asset（数据资产）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer PK | 自增主键 |
| name | String(256) | 资产名称 |
| industry | Enum(finance/medical/government/social) | 行业分类 |
| sensitivity_level | Integer | 敏感等级（1-5） |
| compliance_tags | JSON | 合规标签列表 |
| asset_hash | String(256) UNIQUE | 资产内容 Hash（确权凭证） |
| ownership_credential | Text | 所有权凭证 |
| chain_record | String(512) | 链上记录 ID |
| graph_snapshot_id | FK → graph_snapshots | 关联图快照 |
| owner_id | FK → users | 资产所有者 |
| status | Enum(active/inactive/archived) | 资产状态 |

### 3. GraphSnapshot（图快照）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer PK | 自增主键 |
| asset_id | FK → assets | 关联资产 |
| nodes | JSON | 节点列表 [{id, label, attrs}] |
| edges | JSON | 边列表 [{source, target, weight, cost, time, label}] |
| node_count | Integer | 节点数 |
| edge_count | Integer | 边数 |
| created_at | DateTime | 快照时间 |

### 4. Contract（数据共享合约）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer PK | 自增主键 |
| title | String(256) | 合约名称 |
| provider_id | FK → users | 数据提供方 |
| consumer_id | FK → users | 数据消费方 |
| purpose | Text | 数据使用目的 |
| valid_from / valid_until | DateTime | 有效期 |
| accessible_fields | JSON | 可访问字段列表 |
| allowed_algorithms | JSON | 允许使用的算法列表 |
| privacy_budget_limit | Float | 隐私预算上限（ε） |
| status | Enum(draft/pending/active/suspended/terminated) | 合约状态 |
| contract_hash | String(256) UNIQUE | 合约内容 Hash |

### 5. AuthorizationPolicy（授权策略）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer PK | 自增主键 |
| contract_id | FK → contracts | 关联合约 |
| user_id | FK → users | 被授权用户 |
| asset_id | FK → assets | 目标资产 |
| rbac_roles | JSON | RBAC 角色列表 |
| abac_attrs | JSON | ABAC 属性键值对 |
| allowed_operations | JSON | 允许操作列表 |

### 6. AuditLog（审计日志）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer PK | 自增主键 |
| timestamp | DateTime | 操作时间 |
| user_id | FK → users | 操作用户 |
| username / role | String | 冗余存储（防关联篡改） |
| action | String(256) | 操作描述 |
| target_type / target_id | String | 操作目标 |
| result | Enum(success/failure/warning) | 操作结果 |
| detail | JSON | 详细信息 |
| log_hash | String(256) | 本条日志 Hash |
| prev_hash | String(256) | 前驱日志 Hash（链式结构） |

### 7. PrivacyTask（隐私计算任务）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer PK | 自增主键 |
| asset_id | FK → assets | 使用的资产 |
| algorithm | Enum(graph_sdp/gcc_sdp/gs_ldp/ndkd) | 使用的算法 |
| params | JSON | 算法参数（ε、k 等） |
| input_summary | JSON | 输入图统计摘要 |
| result | JSON | 算法输出结果 |
| metrics | JSON | 效用度量指标（KL 散度、MAE 等） |
| elapsed_ms | Float | 执行耗时（毫秒） |
| explanation_steps | JSON | 算法步骤逐步解析 |

### 8. VPCSQuery（加密路径查询）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer PK | 自增主键 |
| asset_id | FK → assets | 查询的图资产 |
| source_node / target_node | String | 起终节点 |
| cost_threshold / time_threshold / distance_constraint / budget | Float | 多维约束参数 |
| encrypted_graph_summary | JSON | 加密图摘要（节点数、哑边数） |
| dummy_edge_count | Integer | 插入的哑边数量 |
| result_path | JSON | 查询结果路径节点列表 |
| result_distance / result_cost / result_time | Float | 路径多维度量 |
| proof_hash | String(256) | HMAC 证明值 |
| verify_result | Boolean | 验证是否通过 |
| tampered | Boolean | 是否触发篡改演示 |

### 9. ZKGCNProof（零知识推理证明）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer PK | 自增主键 |
| asset_id | FK → assets | 使用的图资产 |
| model_type | String | 模型类型（gcn） |
| input_nodes | JSON | 输入节点列表 |
| adjacency_summary | JSON | 邻接矩阵摘要 |
| layer_summaries | JSON | 各 GCN 层计算摘要 |
| inference_result | JSON | 推理结果（节点分类概率） |
| public_input_hash | String | 公开输入 Hash |
| witness_summary | JSON | 证明 Witness 摘要 |
| proof_hash | String | Groth16 风格证明 Hash |
| vk_hash / pk_hash | String | 验证密钥/证明密钥 Hash |
| verify_result | Boolean | 验证是否通过 |
| tampered | Boolean | 是否触发篡改演示 |
| proof_size_kb | Float | 证明大小（KB） |

### 10. RiskEvent（风险事件）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer PK | 自增主键 |
| event_type | Enum(anomaly_access/unauthorized_access/budget_exceeded/expired_access/verify_failure/data_quality) | 风险类型 |
| severity | Enum(low/medium/high/critical) | 严重等级 |
| asset_id | FK → assets | 涉及资产 |
| user_id | FK → users | 涉及用户 |
| description | Text | 事件描述 |
| risk_score | Float | 风险评分（0-100） |
| status | Enum(open/investigating/resolved) | 处理状态 |

### 11. DemoScenario（行业演示场景）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer PK | 自增主键 |
| scenario_key | Enum(finance/medical/government) UNIQUE | 场景标识 |
| title | String | 场景名称 |
| description | Text | 场景说明 |
| steps | JSON | 演示步骤列表 |
| asset_id | FK → assets | 关联资产 |
| last_run_at | DateTime | 上次执行时间 |
| last_result | JSON | 上次执行结果 |

---

## 算法模块说明

### 1. Graph-SDP（混洗差分隐私度分布发布）

**算法原理**：Encode-Shuffle-Analyze（ESA）框架。将中心化差分隐私的高精度优势与本地差分隐私的强隐私保证相结合，通过引入可信混洗器放大隐私保护程度。

**输入**：图快照（节点-边列表）、隐私预算 ε（建议 0.5～2.0）、度直方图最大度值 max_degree

**输出**：
- `original_distribution`：原始度分布直方图
- `noisy_distribution`：k-RR 局部扰动后的含噪直方图
- `corrected_distribution`：经 MLE 校正后的最终发布分布
- `explanation_steps`：算法分步解析（含每步数学公式描述）
- `metrics`：KL 散度、最大绝对误差 MAE、均方误差 MSE

**关键步骤**：
1. **度序列提取**：遍历图，统计每个节点度数，构建度分布直方图 D
2. **k-RR 局部扰动**：每个节点以概率 p = e^ε/(e^ε + k - 1) 上报真实度，以概率 (1-p)/(k-1) 随机选择其他度值，k 为度的取值数量
3. **混洗放大**：模拟混洗器对扰动报告进行随机置换，隐私放大因子为 O(1/√n)
4. **MLE 校正**：对汇聚的含噪计数进行最大似然估计（迭代期望最大化），恢复最接近真实分布的无偏估计

**核心文件**：`backend/app/algorithms/graph_sdp.py`

---

### 2. GCC-SDP（聚类系数差分隐私发布）

**算法原理**：拉普拉斯机制（Laplace Mechanism）+ 邻居扰动，发布图全局聚类系数的隐私保护版本。

**输入**：图快照、隐私预算 ε

**输出**：
- `true_gcc`：真实全局聚类系数
- `noisy_gcc`：加拉普拉斯噪声后的聚类系数
- `sensitivity`：全局敏感度（理论推导值）
- 逐步解析：三角计数、楔形计数、敏感度计算、噪声添加

**关键步骤**：
1. **三角计数**：对每个节点统计参与的三角形数量（邻接矩阵平方取对角）
2. **楔形计数**：对每个节点统计二度邻居路径（以节点 v 为中心的楔形数 = C(deg(v), 2)）
3. **全局聚类系数计算**：GCC = 3 × 三角形数量 / 楔形数量
4. **全局敏感度推导**：分析单条边增删对 GCC 值变化的最大影响量
5. **拉普拉斯噪声注入**：从 Lap(Δf/ε) 采样并加入真实值

**核心文件**：`backend/app/algorithms/gcc_sdp.py`

---

### 3. GS-LDP（分布式图统计本地差分隐私）

**算法原理**：对称一元编码（Symmetric Unary Coding, SUC）+ 随机响应（Randomized Response），在纯本地差分隐私模型下，不依赖可信第三方，从每个用户处采集扰动后的图统计信息。

**输入**：图快照、本地隐私预算 ε_local

**输出**：三类统计量的原始值与隐私估计值：
- 度分布（Degree Distribution）
- 三角计数（Triangle Count）
- 聚类系数（Clustering Coefficient）
- 每类统计量附对应相对误差

**关键步骤**：
1. **度分布采集**：每个节点对其真实度值进行 SUC 编码，然后按随机响应机制扰动，收集后频率反转估计
2. **三角计数采集**：利用二阶邻居随机响应，每个节点独立扰动其参与三角形数量，汇总后修正系统误差
3. **聚类系数采集**：基于扰动后的度与三角计数联合估计每个节点的局部聚类系数，最终取平均
4. **SUC 编码说明**：将整数 v（范围 0～k-1）编码为长度 k 的二进制向量，第 v 位为 1，其余为 0，再按 ε 逐位进行随机响应

**核心文件**：`backend/app/algorithms/gs_ldp.py`

---

### 4. NDKD（邻居子图扰动 k-度匿名）

**算法原理**：通过对图中每个节点的邻居子图施加扰动，并对节点按度值进行 k-匿名分组，重构满足 k-度匿名性质的图，使攻击者无法从度序列区分出具体个体。

**输入**：图快照、匿名参数 k（建议 2～5）

**输出**：
- `anonymized_edges`：重构的匿名图边列表
- `original_degree_sequence`：原始度序列
- `anonymized_degree_sequence`：匿名后度序列
- `degree_groups`：k-度匿名分组详情
- 效用度量：度序列 MAE、图密度变化

**关键步骤**：
1. **邻居子图扰动**：对每个节点，以概率 p 随机删除现有邻边，以概率 q 随机添加新邻边，p 和 q 由邻居子图全局敏感度决定
2. **度序列提取**：提取扰动后图的度序列并排序
3. **k-度匿名分组**：将排序后的度序列按最小代价贪心分组，每组至少 k 个节点，组内所有节点目标度值相同（取组内最大度）
4. **度序列修正**：对目标度与当前度不符的节点，通过加边或删边使其达到目标度值
5. **图重构验证**：验证输出图满足 k-度匿名性（任意节点度值至少存在 k-1 个相同度值的其他节点）

**核心文件**：`backend/app/algorithms/ndkd.py`

---

### 5. VPCS（加密图可验证约束最短路径查询）

**算法原理**：四角色协议（GO/CS/Proxy/QU），通过哑边（Dummy Edge）加密隐藏真实图结构，在加密图上执行约束最短路径查询，并借助 HMAC 消息认证码实现查询结果的可验证性，防止云服务器返回篡改结果。

**四角色定义**：
- **GO（Graph Owner，图所有者）**：持有原始图，负责图加密、密钥管理和查询授权
- **CS（Cloud Server，云服务器）**：存储加密图并执行查询计算，不可信
- **Proxy（代理服务器）**：协助处理查询请求，辅助解密，半可信
- **QU（Query User，查询用户）**：提交查询请求并验证查询结果

**输入**：
- 图资产（节点/边带多维权重：距离、费用、时间）
- 查询参数：起点、终点、约束阈值（距离、费用、时间、预算）
- 是否触发篡改演示（`tamper=true`）

**输出**：
- `encrypted_graph_summary`：加密图描述（真实节点数、哑边数）
- `candidate_paths`：候选路径集合
- `result_path`：最优约束路径
- `result_distance / result_cost / result_time`：路径多维度量
- `proof_hash`：HMAC 证明值（用于验证结果未被篡改）
- `verify_result`：验证是否通过（篡改演示时为 false）
- `protocol_steps`：四角色协议逐步交互记录

**关键步骤**：
1. **图加密（GO）**：GO 对图中每条真实边的权重进行同态思想加密（密钥加偏移），并随机插入若干哑边（Dummy Edge）混淆图结构
2. **加密图上传（GO→CS）**：GO 将加密图发送至 CS 存储
3. **查询提交（QU→Proxy）**：QU 向 Proxy 提交加密查询请求（约束参数亦经过加密）
4. **约束最短路径搜索（CS）**：CS 在加密图上运行多约束最短路径算法（基于 Dijkstra 变体），返回候选路径集合
5. **结果解密与验证（Proxy→QU）**：Proxy 解密路径权重，计算 HMAC 签名，QU 使用共享密钥验证签名完整性
6. **篡改攻击演示**：模拟 CS 修改返回路径权重，HMAC 验证失败，触发红色告警

**核心文件**：`backend/app/algorithms/vpcs.py`

---

### 6. zkGCN（图卷积网络推理零知识证明）

**算法原理**：将 GCN 的前向推理过程转化为算术电路，通过 fixed-point 定点量化将浮点运算变为整数域运算，构建 R1CS（Rank-1 Constraint System）约束系统，生成 Groth16 风格的简洁零知识证明（zk-SNARK），使任意验证者在不获知模型参数或输入数据的条件下验证推理结果的正确性。

**输入**：
- 图资产（邻接矩阵 + 节点特征矩阵）
- GCN 模型参数（层数、隐藏维度；演示中使用模拟参数）
- 是否触发篡改演示

**输出**：
- `layer_summaries`：各 GCN 层计算摘要（输入维度、输出维度、激活函数）
- `inference_result`：节点分类结果（每个节点的类别概率）
- `adjacency_summary`：邻接矩阵规模描述
- `witness_summary`：证明 Witness 摘要（R1CS 变量数、约束数）
- `proof_hash`：Groth16 风格证明 Hash
- `vk_hash / pk_hash`：验证密钥/证明密钥 Hash
- `verify_result`：验证是否通过
- `proof_size_kb`：证明大小
- `explanation_steps`：推理+证明全流程逐步解析

**关键步骤**：
1. **GCN 前向推理**：H^(l+1) = σ(Ã · H^(l) · W^(l))，Ã 为归一化邻接矩阵，σ 为 ReLU 激活函数
2. **Fixed-Point 量化**：将浮点权重矩阵 W 和特征矩阵 H 量化为整数域（定点小数，精度因子 2^16），使后续运算在整数域完成，满足 R1CS 要求
3. **R1CS 约束构造**：将每次矩阵乘法和激活函数转化为形如 (a · b = c) 的二次约束，构建稀疏约束矩阵 (A, B, C)
4. **Witness 生成**：计算满足所有约束的 Witness 向量（中间计算值的完整赋值）
5. **Groth16 风格证明生成**：使用证明密钥（pk）和 Witness 生成紧凑证明 π（演示实现为 SHA256 承诺链），输出 proof_hash
6. **证明验证**：使用验证密钥（vk）和公开输入 Hash 验证 π 的有效性；篡改演示时修改推理结果，证明验证失败

**核心文件**：`backend/app/algorithms/zkgcn.py`

---

## API 接口说明

### 系统接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /health | 健康检查，返回服务状态 |

### 数据资产（/api/assets）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/assets | 获取资产列表（分页、行业过滤） |
| POST | /api/assets | 创建新数据资产 |
| GET | /api/assets/{id} | 获取资产详情 |
| PUT | /api/assets/{id} | 更新资产信息 |
| DELETE | /api/assets/{id} | 删除（归档）资产 |
| GET | /api/assets/{id}/snapshots | 获取资产图快照列表 |
| POST | /api/assets/{id}/snapshots | 为资产创建图快照 |

### 合约管理（/api/contracts）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/contracts | 获取合约列表 |
| POST | /api/contracts | 创建合约 |
| GET | /api/contracts/{id} | 获取合约详情 |
| PUT | /api/contracts/{id}/status | 更新合约状态 |
| GET | /api/contracts/stats | 合约统计摘要 |

### 授权策略（/api/authz）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/authz | 获取授权策略列表 |
| POST | /api/authz | 创建授权策略 |
| DELETE | /api/authz/{id} | 删除授权策略 |

### 审计追踪（/api/audit）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/audit | 获取审计日志列表（分页） |
| GET | /api/audit/{id} | 获取单条日志详情 |
| POST | /api/audit/verify-chain | 验证哈希链完整性 |
| POST | /api/audit/tamper-demo | 触发篡改演示 |
| GET | /api/audit/stats | 审计统计摘要 |

### 隐私计算（/api/privacy）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/privacy/run | 执行隐私计算任务（指定算法和参数） |
| GET | /api/privacy/tasks | 获取任务历史列表 |
| GET | /api/privacy/tasks/{id} | 获取任务详情 |
| GET | /api/privacy/algorithms | 获取支持的算法列表及参数说明 |

### VPCS 查询（/api/vpcs）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/vpcs/query | 执行加密路径查询 |
| GET | /api/vpcs/queries | 获取查询历史 |
| GET | /api/vpcs/queries/{id} | 获取查询详情（含证明） |
| POST | /api/vpcs/verify | 独立验证接口（输入 proof_hash 验证） |

### zkGCN 证明（/api/zkgcn）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/zkgcn/prove | 执行 GCN 推理并生成证明 |
| GET | /api/zkgcn/proofs | 获取证明历史 |
| GET | /api/zkgcn/proofs/{id} | 获取证明详情 |
| POST | /api/zkgcn/verify | 独立验证接口 |

### 风险事件（/api/risks）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/risks | 获取风险事件列表（按严重度、状态过滤） |
| POST | /api/risks | 手动记录风险事件 |
| GET | /api/risks/{id} | 获取事件详情 |
| PUT | /api/risks/{id}/status | 更新处理状态 |
| GET | /api/risks/stats | 风险统计摘要 |

### 行业场景演示（/api/demo）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/demo/scenarios | 获取所有场景列表 |
| GET | /api/demo/scenarios/{key} | 获取场景详情 |
| POST | /api/demo/scenarios/{key}/run | 执行场景演示（流式步骤输出） |

---

## 安全设计

### 哈希链审计日志

每条 `AuditLog` 记录写入时，系统计算：

```
log_hash = SHA256(timestamp + user_id + action + target + result + detail + prev_hash)
```

通过 `prev_hash` 字段将所有日志串联为单向哈希链。任何中间节点的内容被篡改，均会导致从该节点起的所有后续 `log_hash` 验证失败，实现了不可篡改的全链路审计追踪。

### RBAC + ABAC 双模授权

- **RBAC（基于角色）**：平台定义 admin/analyst/auditor/demo 四个角色，每个角色映射到一组默认操作权限。接口层在路由中检查当前用户角色。
- **ABAC（基于属性）**：`AuthorizationPolicy` 模型支持在合约维度定义细粒度属性策略，如 `{"data_domain": "finance", "purpose": "risk_control"}` 只允许特定属性用户访问。
- **合约绑定**：每个授权策略必须绑定一个有效合约，合约到期后策略自动失效，风险监控模块同步触发 `expired_access` 事件。

### 密码学演示声明

> **注意**：本平台中的 VPCS 加密操作（边权重加密）和 zkGCN 零知识证明（Groth16 风格证明）均为**演示级实现**，使用 HMAC-SHA256 和哈希承诺链模拟密码学原语的行为逻辑。在真实生产环境中，应替换为：
>
> - VPCS 边加密：AES-GCM 或同态加密库（如 Microsoft SEAL）
> - zkGCN 证明：完整的 zk-SNARK 实现（如 snarkjs、bellman、gnark）
>
> 当前实现完整呈现了协议的交互流程与安全属性，足以支撑算法原理的演示与验证。
