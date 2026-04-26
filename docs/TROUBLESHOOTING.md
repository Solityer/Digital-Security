# Troubleshooting

本文档面向比赛演示前的快速排障，优先覆盖“页面打不开”“接口 422/500”“端口占用”“代理不通”“图算法页空白”等高频问题。

## 一键排查顺序

```bash
bash scripts/stop.sh
bash scripts/dev.sh
bash scripts/check.sh
bash scripts/smoke_api.sh
```

如果上面四步都通过，当前版本即可用于比赛演示。

## 常见问题

### 1. 前端能打开，但页面空白或报 `map/reduce` 错误

- 原因通常是后端返回对象包装变化，前端把对象当数组处理。
- 当前版本已经通过 `frontend/src/api/normalizers.ts` 做统一适配。
- 若再次出现，优先检查接口是否仍返回 `{ total, items }` 或 `result` 包装。

### 2. `bash scripts/dev.sh` 启动失败

- 先执行：`bash scripts/stop.sh`
- 查看日志：

```bash
tail -n 100 logs/backend-dev.log
tail -n 100 logs/frontend-dev.log
```

- 常见原因：8000 或 3000 端口已被其他进程占用、依赖未安装完成、Node 或 Python 不可用。

### 3. 前端代理 `/api` 或 `/health` 不通

- 检查 Vite 是否运行在 `0.0.0.0:3000`
- 检查后端是否运行在 `127.0.0.1:8000`
- 执行：`bash scripts/check.sh`
- 网络诊断结果会写入：`logs/network-diagnosis.log`

### 4. Risk Evaluate 返回 422

- `POST /api/risks/evaluate` 必须带 `event_type`
- 合法值包括：`anomaly_access`、`unauthorized_access`、`budget_exceeded`、`expired_access`、`verify_failure`、`data_quality`

### 5. VPCS / zkGCN 页面无结果

- 先确认资产已经生成图快照：

```bash
curl -s http://127.0.0.1:8000/api/assets
curl -s -X POST http://127.0.0.1:8000/api/assets/1/graph/generate
```

- 再执行：`bash scripts/smoke_api.sh`
- 如果 smoke 通过，说明接口本身正常，问题通常在页面选择的资产或参数上。

### 6. 审计链校验返回 false

- 这不一定是服务坏掉。
- 当前演示数据中包含篡改演示相关记录，`verify-chain` 返回 `false` 可能是预期现象。
- 关注点应是“接口正常返回且页面能展示 tampered IDs 与告警状态”。

### 7. 外部设备无法访问 3000 端口

- 当前前端 dev server 已绑定 `0.0.0.0:3000`
- 执行 `hostname -I` 获取本机 IP
- 在同一局域网内使用 `http://<你的IP>:3000` 访问
- 如仍不可访问，优先检查本机防火墙、安全组或 WSL 端口转发策略

## 推荐检查命令

```bash
curl -I http://127.0.0.1:3000
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/api/assets
curl http://127.0.0.1:8000/health
```

## 关键日志文件

- `logs/backend-dev.log`：后端运行日志
- `logs/frontend-dev.log`：前端 Vite 日志
- `logs/check.log`：健康检查结果
- `logs/network-diagnosis.log`：网络暴露与监听状态
- `logs/smoke-api.log`：核心接口烟雾测试结果
