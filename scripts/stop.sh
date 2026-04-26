#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"
BACKEND_PID_FILE="$LOG_DIR/backend.pid"
FRONTEND_PID_FILE="$LOG_DIR/frontend.pid"

stop_by_pid_file() {
  local label="$1"
  local pid_file="$2"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
      echo "已停止 $label (PID $pid)"
    fi
    rm -f "$pid_file"
  fi
}

stop_by_port() {
  local label="$1"
  local port="$2"
  local pids
  pids="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    kill $pids >/dev/null 2>&1 || true
    echo "已释放 $label 端口 $port"
  fi
}

mkdir -p "$LOG_DIR"

stop_by_pid_file "后端服务" "$BACKEND_PID_FILE"
stop_by_pid_file "前端服务" "$FRONTEND_PID_FILE"
stop_by_port "后端服务" 8000
stop_by_port "前端服务" 3000

echo "停止完成"