# API Contract Check

本文档记录比赛演示版本中已经对齐并验证过的关键接口契约，避免前后端再次因字段漂移导致页面空白、`map/reduce` 报错或图表无数据。

## 已验证结果

- 后端编译通过：`python -m compileall app`
- 后端测试通过：`26 passed`
- 前端构建通过：`npm run build`
- 运行期检查通过：`bash scripts/check.sh`
- 运行期烟雾验收通过：`bash scripts/smoke_api.sh`

## 全局约定

- 列表接口统一兼容 `{ total, items }`。
- 前端通过 `frontend/src/api/normalizers.ts` 兼容 `items`、`assets`、`scenarios`、`result` 等包装层。
- 详情和列表对象统一兼容别名字段：`asset_id`、`contract_id`、`log_id`、`risk_id`、`scenario_id`。
- 关键算法页统一读取 `explanation_steps`，不再依赖旧版硬编码字段。

## 核心接口契约

### 健康检查

- `GET /health`
- 返回字段：`status`、`service`、`version`、`modules`、`timestamp`
- `modules` 用于 Dashboard 和诊断页展示模块状态。

### 资产接口

- `GET /api/assets`
- 返回：`{ total, items }`
- 每项至少包含：`id`、`asset_id`、`name`、`industry`、`node_count`、`edge_count`

- `GET /api/assets/{id}`
- 返回资产详情，并在 `graph_snapshot` 中附带图快照。

- `POST /api/assets/{id}/graph/generate`
- 返回字段包含：`graph`、`node_count`、`edge_count`

### 合约接口

- `GET /api/contracts`
- 返回：`{ total, items }`
- 每项兼容：`id`、`contract_id`、`provider`、`consumer`

- `POST /api/authz/evaluate`
- 前端使用字段：`user_id`、`asset_id`、`context_attrs`

### 风险接口

- `GET /api/risks`
- 返回：`{ total, items }`
- 每项兼容：`risk_score` / `score`、`created_at` / `detected_at`

- `POST /api/risks/evaluate`
- 必填字段：`event_type`
- 前端当前使用 `event_type + context`

- `POST /api/risks/report`
- 风险报告页和 Dashboard 均依赖该 POST 接口
- 返回补充字段：`risk_score`、`summary`、`recommendations`、`trend`

### 审计接口

- `GET /api/audit/logs`
- 返回：`{ total, items }`
- 每项兼容：`id`、`log_id`、`target`、`timestamp`

- `POST /api/audit/verify-chain`
- 返回兼容字段：`chain_intact`、`is_valid`、`invalid_count`、`tampered_ids`

### 隐私计算接口

- `POST /api/privacy/graph-sdp`
- 使用字段：`asset_id`、`epsilon`、`L`

- `POST /api/privacy/gcc-sdp`
- 使用字段：`asset_id`、`epsilon`

- `POST /api/privacy/gs-ldp`
- 使用字段：`asset_id`、`epsilon`、`randomize_edges`、`randomize_attributes`、`edge_flip_prob`、`attr_noise_scale`

- `POST /api/privacy/ndkd`
- 使用字段：`asset_id`、`k`、`epsilon`

- 四类隐私任务统一返回 `PrivacyTaskResponse`
- 前端读取：`result`、`metrics`、`elapsed_ms`、`explanation_steps`

### VPCS 接口

- `POST /api/vpcs/query`
- `POST /api/vpcs/tamper-demo`
- 必填字段：`asset_id`、`source_node`、`target_node`
- 返回兼容字段：`result_path` / `path`、`result_distance` / `distance`、`result_cost` / `cost`、`result_time` / `time`
- 展示字段：`proof_hash`、`verify_result`、`encrypted_graph_summary`、`encrypted_graph`、`elapsed_ms`、`explanation_steps`

### zkGCN 接口

- `POST /api/zkgcn/infer`
- `POST /api/zkgcn/tamper-demo`
- 常用字段：`asset_id`、`layers`、`hidden_dim`、`model_type`
- 返回字段：`inference_result`、`predicted_class`、`class_name`、`proof_hash`、`proof_size_kb`、`verify_result`、`layer_summaries`、`explanation_steps`

### 场景接口

- `GET /api/demo/scenarios`
- 返回同时兼容：`items` 和 `scenarios`
- 每项兼容：`id`、`key`、`scenario_key`、`scenario_id`、`name`、`title`

- `POST /api/demo/run/{scenario}`
- 返回兼容：`status`、`duration_ms`、`message`、`steps`、`metrics`

## 前端页面对应关系

- Dashboard：`/health`、`/api/assets`、`/api/contracts`、`/api/audit/logs`、`/api/risks`
- Data Assets：`/api/assets`、`/api/assets/{id}`、`/api/assets/{id}/graph/generate`
- Privacy Lab：`/api/privacy/*`
- VPCS Query：`/api/vpcs/query`、`/api/vpcs/tamper-demo`
- zkGCN：`/api/zkgcn/infer`、`/api/zkgcn/tamper-demo`
- System Diagnostics：`/health`、`/api/assets`、`/api/contracts`、`/api/audit/logs`、`/api/risks`
