#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
LOG_DIR="$PROJECT_DIR/logs"
BACKEND_LOG="$LOG_DIR/backend-dev.log"
FRONTEND_LOG="$LOG_DIR/frontend-dev.log"
BACKEND_PID_FILE="$LOG_DIR/backend.pid"
FRONTEND_PID_FILE="$LOG_DIR/frontend.pid"
LAST_PORT_FILE="$LOG_DIR/last_port.txt"

mkdir -p "$LOG_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少命令: $1" >&2
    exit 1
  fi
}

wait_for_url() {
  local label="$1"
  local url="$2"
  local attempts="${3:-60}"
  local i

  for ((i = 1; i <= attempts; i += 1)); do
    if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
      echo "[OK] $label 已就绪: $url"
      return 0
    fi
    sleep 1
  done

  echo "[FAIL] $label 启动超时: $url" >&2
  return 1
}

cleanup_on_failure() {
  echo "启动失败，停止已拉起的服务..." >&2
  "$SCRIPT_DIR/stop.sh" >/dev/null 2>&1 || true
}

trap cleanup_on_failure ERR

require_command python3
require_command npm
require_command curl

echo "========================================="
echo "  数智安行｜图数据可信治理与智能流通平台"
echo "  启动开发环境"
echo "========================================="

"$SCRIPT_DIR/stop.sh" >/dev/null 2>&1 || true

cd "$BACKEND_DIR"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi

PYTHON_BIN="$BACKEND_DIR/.venv/bin/python"
PIP_BIN="$BACKEND_DIR/.venv/bin/pip"

echo "[1/5] 安装后端依赖"
"$PIP_BIN" install -q -r requirements.txt

echo "[2/5] 初始化数据库和基线数据"
"$PYTHON_BIN" - <<'PY'
import asyncio
import sys

sys.path.insert(0, '.')

from app.database import init_db

asyncio.run(init_db())
PY

"$PYTHON_BIN" - <<'PY'
import asyncio
import sys

sys.path.insert(0, '.')

from app.seed.seed_data import main

asyncio.run(main())
PY

cd "$FRONTEND_DIR"
echo "[3/5] 安装前端依赖"
if [[ ! -d node_modules ]]; then
  npm install
fi

echo "[4/5] 启动后端服务"
cd "$BACKEND_DIR"
nohup "$PYTHON_BIN" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 >"$BACKEND_LOG" 2>&1 &
echo $! > "$BACKEND_PID_FILE"

echo "[5/5] 启动前端服务"
cd "$FRONTEND_DIR"
nohup npm run dev >"$FRONTEND_LOG" 2>&1 &
echo $! > "$FRONTEND_PID_FILE"

wait_for_url "后端健康检查" "http://127.0.0.1:8000/health"
wait_for_url "前端首页" "http://127.0.0.1:3000"

printf '3000\n' > "$LAST_PORT_FILE"

LAN_IP="$(ip route get 1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')"
if [[ -z "$LAN_IP" ]]; then
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi

echo
echo "服务启动完成"
echo "前端: http://127.0.0.1:3000"
echo "诊断页: http://127.0.0.1:3000/diagnostics"
echo "后端: http://127.0.0.1:8000"
echo "接口文档: http://127.0.0.1:8000/docs"
if [[ -n "$LAN_IP" ]]; then
  echo "局域网访问: http://$LAN_IP:3000"
fi
echo "后端日志: $BACKEND_LOG"
echo "前端日志: $FRONTEND_LOG"
echo "停止服务: bash scripts/stop.sh"

trap - ERR
