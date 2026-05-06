# 技术一致性审计报告 — 数智安行｜图数据可信治理与智能流通平台

> 生成时间：2026-04-28  
> 审计人：高级全栈/图算法/密码协议工程师团队  
> 审计对象：`/home/match/Digital-Security` 全量代码

---

## 一、原版文件技术摘要

### 1. 混洗差分隐私保护的度分布直方图发布算法（Graph-SDP）
**期刊**：西安电子科技大学学报，2023年12月，第50卷第6期  
**核心技术**：
- Encode-Shuffle-Analyze (ESA) 框架
- 交互式用户分组（Interactive User Grouping）
- 方波本地加噪扰动机制（Square-wave local noise）
- k-随机响应（k-RR）本地扰动
- 混洗器（Shuffler）隐私放大
- 极大似然估计（MLE）分析器端矫正
- 度分布直方图发布
- 效用评估：L1距离、Hellinger距离、MSE
- 隐私保证：(ε,σ)-混洗差分隐私

### 2. 基于差分隐私的图数据发布隐私保护模型研究（GCC-SDP）
**类型**：硕士学位论文，贵州财经大学，2024年5月  
**核心技术**：
- GCC-SDP：混洗差分隐私保护的聚类系数发布算法
- 收集2-跳邻居信息（楔形列表 wedge list）
- 随机响应机制收集邻接位向量
- 拉普拉斯机制收集本地度值
- 估计局部三角计数，进而估计全局聚类系数
- 无偏估计（unbiased estimation）
- 效用评估：MSE、MAE
- 可提升MSE最高66.5%、MAE最高51%

### 3. 基于本地差分隐私的分布式图统计采集算法（GS-LDP）
**期刊**：计算机研究与发展，2024年，第61卷第7期  
**核心技术**：
- Node-LDP 与 Edge-LDP 两种隐私模式
- 分组机制（Grouping Mechanism）
- 对称一元编码（Symmetric Unary Coding, SUC）
- 度分布采集（Degree Distribution Collection）
- 剪枝算法缓解噪声边（Pruning Algorithm）
- 三角计数序列采集（Triangle Count Collection）：Node-LDP版和Edge-LDP版
- 拉普拉斯机制采集聚类系数
- 多统计指标同时发布

### 4. 邻居子图扰动下的k-度匿名隐私保护模型（NDKD）
**期刊**：西安电子科技大学学报，2023年8月，第50卷第4期  
**核心技术**：
- 邻居子图扰动（Neighbor Subgraph Disturbance）
- k-度匿名（k-Degree Anonymity）
- 度序列分组（Degree Sequence Grouping）：分治策略
- 匿名图重构：边修改 + 子图边缘修改
- 抗节点度攻击（Anti-degree attack）
- 抗邻居子图攻击（Anti-neighbor-subgraph attack）
- 效用指标：边变化比例、信息损失、平均节点度变化、聚类系数变化

### 5. VPCS: Verifiable Query Scheme for Privacy-preserving Constrained Shortest Path over Encrypted Graph Data
**会议**：2024 IEEE International Conference on Web Services (ICWS)  
**核心技术**：
- 四角色协议：Graph Owner (GO)、Cloud Server (CS)、Proxy、Query User (QU)
- 加密图外包（Threshold Paillier Cryptosystem, TPC）
- 虚假边（Dummy Edge）隐藏真实图结构
- 约束最短路径查询（CSP：满足cost、time等多维约束）
- 安全共享比较协议（SSC）和安全最小值协议（SM）
- 双线性映射（Bilinear Mapping）+零知识证明
- 结果可验证性（IND-CQVA安全证明）

### 6. zkGCN: Zero-Knowledge Proofs of Inference for Graph Convolutional Networks
**发表**：贵州财经大学（2024，SCI收录期刊）  
**核心技术**：
- 基于zk-SNARK的GCN推理完整性验证
- Rank-1 Constraint Satisfaction (R1CS) 约束提取
- 图卷积层计算逻辑转R1CS电路设计
- Witness（见证）生成与提交
- 证明密钥(pk)和验证密钥(vk)
- Groth16风格零知识证明
- 验证：proof、pk、vk三元组验证
- 保护模型私有参数（权重不泄露）
- 篡改检测：模型参数或结构改变后验证失败

---

## 二、技术一致性审计表

| 原版文件 | 核心技术点 | 当前代码文件 | 当前实现方式 | 符合程度 | 主要问题 | 修复建议 |
|---------|-----------|-------------|-------------|---------|---------|---------|
| Graph-SDP论文 | ESA框架 | `graph_sdp.py` | 完整实现编码→混洗→分析三阶段 | **部分实现** | 缺少方波本地加噪扰动；交互分组已简化；未实现(ε,σ)-SDP严格隐私证明 | 增加方波噪声选项；说明简化点 |
| Graph-SDP论文 | k-RR机制 | `graph_sdp.py` | 正确实现k-RR, p=exp(ε/2)/(exp(ε/2)+k-1) | **部分实现** | k-RR公式正确，但原始论文用方波噪声+混洗 | 当前实现为k-RR变体，已符合核心思想 |
| Graph-SDP论文 | MLE校正 | `graph_sdp.py` | 实现 corrected=(agg-nq)/(p-q) | **部分实现** | 公式正确，但原始论文的MLE更复杂 | 可标注为简化版MLE校正 |
| Graph-SDP论文 | L1/H/MSE效用 | `graph_sdp.py` + `metrics.py` | 完整计算L1、Hellinger距离、MSE | **严格实现** | 无 | 无需修改 |
| GCC-SDP论文 | 混洗DP聚类系数 | `gcc_sdp.py` | 使用边翻转+Laplace噪声；未实现wedge list的SDP收集 | **部分实现** | 未实现2-跳邻居信息收集（wedge list）；未实现真正的无偏估计 | 增加wedge list收集说明；明确标注为核心思想工程化实现 |
| GCC-SDP论文 | 楔形/三角统计 | `gcc_sdp.py` | 使用nx.triangles计算三角形；_count_wedges计算楔形 | **部分实现** | 统计本身正确；噪声机制简化 | 现有实现已展示核心统计量 |
| GCC-SDP论文 | MSE/MAE指标 | `gcc_sdp.py` | 计算abs_delta, rel_delta, per_node_mse | **部分实现** | 缺少MAE指标；指标命名与论文不完全对应 | 增加MAE；在前端展示更清晰 |
| GS-LDP论文 | Node-LDP度分布 | `gs_ldp.py` | 实现1-bit RR+度数去偏差 | **部分实现** | 缺少对称一元编码（SUC）；缺少分组机制 | 已在`gs_ldp.py`增强实现中添加 |
| GS-LDP论文 | 三角计数采集 | `gs_ldp.py` | **未实现** | **不符合/缺失** | 当前仅做边级扰动，无三角计数 | 需增加基于Node-LDP/Edge-LDP的三角计数 |
| GS-LDP论文 | 聚类系数采集 | `gs_ldp.py` | **未实现** | **不符合/缺失** | 当前无聚类系数采集 | 需增加Laplace机制的聚类系数采集 |
| GS-LDP论文 | Node-LDP/Edge-LDP模式 | `gs_ldp.py` | 部分，仅edge级别 | **部分实现** | 无明确的Node/Edge-LDP模式切换 | 已增强实现中添加mode参数 |
| NDKD论文 | k-度匿名 | `ndkd.py` | 实现度序列分组+合并小组+边修改 | **部分实现** | 分组策略与论文分治策略略有差异；邻居子图扰动简化 | 核心流程基本正确，可标注为工程化验证版本 |
| NDKD论文 | 邻居子图扰动 | `ndkd.py` | 实现`_disturb_neighbour_subgraph`边翻转 | **部分实现** | 只对部分节点做扰动（sample_size=n//3）；扰动概率计算方式与论文略有差异 | 当前性能优化可接受，说明简化原因 |
| NDKD论文 | 信息损失/边变化率 | `ndkd.py` + `metrics.py` | 实现edge_change_ratio, info_loss等 | **部分实现** | 指标基本完整；聚类系数变化已计算 | 无需主要修改 |
| VPCS论文 | 四角色协议 | `vpcs.py` | 在explanation_steps描述角色；无独立函数隔离 | **原理级验证实现** | 无真实TPC加密；无bilinear mapping；SHA-256哈希模拟证明 | **必须**在页面、文档中明确标注：当前为工程化验证实现，非正式密码原语 |
| VPCS论文 | Threshold Paillier加密 | `vpcs.py` | 未实现，以SHA-256承诺代替 | **原理级验证实现** | 无同态加密；无真实密文 | 标注：当前为工程化验证实现 |
| VPCS论文 | dummy edges | `vpcs.py` | 正确实现虚假边添加（极大cost/time） | **部分实现** | 虚假边策略正确 | 无需修改 |
| VPCS论文 | 约束最短路径(CSP) | `vpcs.py` | 完整实现多维约束Dijkstra | **部分实现** | CSP算法功能正确；但运行在明文图上而非密文图 | 已在明文图上正确实现CSP |
| VPCS论文 | 结果验证/篡改检测 | `vpcs.py` | SHA-256 proof hash验证；tamper=True可触发校验失败 | **原理级验证实现** | 验证逻辑正确但使用哈希而非ZK证明 | 标注为工程化验证链路，功能完整 |
| zkGCN论文 | zk-SNARK/Groth16 | `zkgcn.py` | SHA-256哈希模拟证明；无真实ZK库 | **原理级验证实现** | 无R1CS约束；无Groth16；无fixed-point算术 | **必须**标注：当前为工程化验证实现，非正式零知识证明系统 |
| zkGCN论文 | GCN推理 | `zkgcn.py` | 实现真实GCN前向传播（归一化邻接、Xavier初始化、ReLU/softmax） | **严格实现** | 使用浮点而非fixed-point；但推理逻辑正确 | 说明使用浮点简化 |
| zkGCN论文 | R1CS约束 | `zkgcn.py` | 未实现真实R1CS | **原理级验证实现** | 见证通过哈希承诺模拟 | 标注：当前版本不含真实R1CS电路 |
| zkGCN论文 | Witness/pk/vk/proof | `zkgcn.py` | 通过SHA-256生成witness_hash、pk_hash、vk_hash、proof_hash | **原理级验证实现** | 哈希链正确，可执行异常检测 | 标注为工程化验证链路即可 |
| 计划书 | 数据资产登记 | `assets.py` + `DataAssets.tsx` | 完整实现资产登记、哈希、凭证、图快照 | **严格实现** | 无重大问题 | 无 |
| 计划书 | 合约授权 | `contracts.py` + `authz.py` | 实现合约CRUD、授权评估 | **部分实现** | 授权策略较简单 | 基本满足当前版本需求 |
| 计划书 | 隐私计算引擎 | `privacy.py` + `PrivacyLab.tsx` | 四种算法全部可调用 | **部分实现** | 详见各算法条目 | 展示核心技术路径 |
| 计划书 | 风险监控 | `risks.py` + `RiskMonitor.tsx` | 风险事件管理、分级、处置 | **部分实现** | 风险检测为规则引擎，非AI | 当前版本满足业务验收需求 |
| 计划书 | 审计追踪 | `audit.py` + `AuditTrail.tsx` | 哈希链审计日志、链完整性验证 | **部分实现** | 哈希链逻辑正确 | 无 |
| 计划书 | 行业场景 | `demo.py` + `ScenarioDemo.tsx` | 三个场景：金融、医疗、政务 | **部分实现** | 场景流程基本完整 | 可进一步丰富 |

---

## 三、技术实现说明与安全边界

### 可以说"严格实现"或"核心实现"的模块：
1. **数据资产登记**：资产哈希、权属凭证、图快照、审计链，工程层面严格实现
2. **GCN推理（zkGCN推理部分）**：真实归一化邻接、Xavier初始化、多层GCN前向传播
3. **约束最短路径（VPCS CSP部分）**：多维约束Dijkstra，明文图上完整可用
4. **Graph-SDP效用指标**：L1距离、Hellinger距离、MSE三项完整实现
5. **审计哈希链**：log_hash + prev_hash + HMAC链验证，功能完整

### 需明确说明工程边界的模块：
1. **VPCS加密证明**：
   > 当前工程版本使用 SHA-256 哈希承诺模拟加密图摘要和路径证明流程，完整展示 VPCS 协议的核心链路与验证思想。**不等同于生产级 Threshold Paillier 密码系统或 Diffie-Hellman/双线性映射实现**。
   
2. **zkGCN零知识证明**：
   > 当前工程版本使用 SHA-256 哈希承诺模拟见证(witness)、证明(proof)、验证密钥(vk)和证明密钥(pk)，展示 zkGCN 的完整协议结构和异常检测能力。**不等同于生产级 zk-SNARK/Groth16 证明系统，不含真实 R1CS 电路和 fixed-point 算术**。

### 禁止出现的表述：
- ❌ "完整工程化落地论文全部算法"
- ❌ "生产级密码安全"
- ❌ "完整实现Groth16"
- ❌ "完整实现Threshold Paillier"
- ❌ "已达到论文安全证明级别"

---

## 四、本轮修复摘要

| 模块 | 修复内容 |
|------|---------|
| 项目名称 | `Layout.tsx` 和 `Dashboard.tsx` 中 "数图信枢" 已全部替换为 "数智安行" |
| GS-LDP | 增加 Node-LDP 度分布（对称一元编码SUC）、三角计数、聚类系数采集；添加 mode 参数 |
| README.md | 去除 "完整工程化落地"、"生产级接口规范" 等夸大表述；添加技术边界说明 |
| DEMO_SCRIPT.md | 增加 2分钟/5-8分钟讲解路线；添加技术边界说明 |
| COMPETITION_HIGHLIGHTS.md | 更新技术亮点说明，诚实标注工程边界模块 |
| docs/API_CONTRACT_CHECK.md | 更新接口规范说明 |
| seed_data.py | 确认无测试化数据；业务风格数据已完整 |

---

## 五、GS-LDP 增强实现说明

当前 `gs_ldp.py` 缺少三角计数和聚类系数采集，与 GS-LDP 论文核心贡献不符。  
已在本轮增强中补充：
- **SUC（对称一元编码）**：用于 Node-LDP 模式下的度分布采集
- **三角计数（Node-LDP）**：基于度分布阈值剪枝，Edge-RR扰动后的三角计数估计
- **聚类系数（Node-LDP/Edge-LDP）**：在三角计数基础上用Laplace机制添加噪声
- **mode 参数**：`node_ldp` | `edge_ldp` 可切换隐私模式

---

*本文档依据原版文件真实内容和当前代码实际实现生成，不作夸大也不作贬低。*
