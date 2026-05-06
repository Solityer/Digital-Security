#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_DIR/backend"
LOG_DIR="$PROJECT_DIR/logs"
BACKUP_DIR="$LOG_DIR/db-backups"
PYTHON_BIN="$BACKEND_DIR/.venv/bin/python"
DB_URL="${DIGITAL_SECURITY_DB_URL:-sqlite+aiosqlite:///./digital_security.db}"

resolve_db_path() {
  local url="$1"
  local path

  if [[ "$url" != sqlite+aiosqlite:///* ]]; then
    echo "当前脚本仅支持 SQLite 数据库 URL: $url" >&2
    exit 1
  fi

  path="${url#sqlite+aiosqlite:///}"
  if [[ "$path" == ./* ]]; then
    printf '%s/%s\n' "$BACKEND_DIR" "${path#./}"
  elif [[ "$path" == /* ]]; then
    printf '%s\n' "$path"
  else
    printf '%s/%s\n' "$BACKEND_DIR" "$path"
  fi
}

mkdir -p "$LOG_DIR" "$BACKUP_DIR"

if [[ ! -x "$PYTHON_BIN" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3)"
  else
    echo "未找到可用的 Python 解释器。" >&2
    exit 1
  fi
fi

DB_PATH="$(resolve_db_path "$DB_URL")"
BACKUP_PATH="$BACKUP_DIR/$(basename "$DB_PATH").$(date +%Y%m%d_%H%M%S).bak"

echo "========================================="
echo "  数智安行｜图数据可信治理与智能流通平台"
echo "  重置本地 SQLite 数据"
echo "========================================="
echo "数据库路径: $DB_PATH"

if [[ -f "$DB_PATH" ]]; then
  cp "$DB_PATH" "$BACKUP_PATH"
  echo "已备份当前数据库: $BACKUP_PATH"
  rm -f "$DB_PATH" "$DB_PATH-shm" "$DB_PATH-wal"
else
  echo "未发现现有数据库文件，跳过备份。"
fi

echo "开始重建数据库并写入基线数据..."
cd "$BACKEND_DIR"
"$PYTHON_BIN" "$SCRIPT_DIR/seed.py"

echo "重置完成。"
