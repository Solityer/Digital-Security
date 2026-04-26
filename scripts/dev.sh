#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo "========================================="
echo "  数智安行 | 数据可信治理平台"
echo "  启动开发环境..."
echo "========================================="

# 检查端口占用
echo "[0/4] 检查端口占用..."
if lsof -i :8000 2>/dev/null | grep LISTEN; then
  echo "警告: 端口 8000 已被占用，请先释放该端口"
  exit 1
fi
if lsof -i :3000 2>/dev/null | grep LISTEN; then
  echo "警告: 端口 3000 已被占用，请先释放该端口"
  exit 1
fi

# 检查并安装后端依赖
echo "[1/4] 安装后端依赖..."
cd "$BACKEND_DIR"
# Use venv if available
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
.venv/bin/pip install -r requirements.txt -q
PY=".venv/bin/python"
UV=".venv/bin/uvicorn"

# 初始化数据库和种子数据
echo "[2/4] 初始化数据库..."
cd "$BACKEND_DIR"
$PY -c "
import asyncio, sys
sys.path.insert(0, '.')
from app.database import init_db
asyncio.run(init_db())
print('数据库初始化完成')
"

# 运行种子数据（如果数据库为空）
$PY -c "
import asyncio, sys
sys.path.insert(0, '.')
from app.seed.seed_data import main as seed_main
asyncio.run(seed_main())
" 2>/dev/null || echo "种子数据已存在，跳过"

# 检查前端依赖
echo "[3/4] 检查前端依赖..."
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
  echo "安装前端依赖..."
  npm install
fi

# 获取局域网 IP
LAN_IP=$(ip route get 1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1); exit}' || hostname -I 2>/dev/null | awk '{print $1}' || echo "")

# 启动服务
echo "[4/4] 启动服务..."
echo ""
echo "本机前端: http://127.0.0.1:3000"
echo "本机后端: http://127.0.0.1:8000"
echo "后端文档: http://127.0.0.1:8000/docs"
if [ -n "$LAN_IP" ]; then
  echo "局域网前端: http://${LAN_IP}:3000"
fi
echo ""
echo "按 Ctrl+C 停止所有服务"
echo ""

# 在后台启动后端
cd "$BACKEND_DIR"
$UV app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# 在后台启动前端
cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!

# 等待并捕获 Ctrl+C
trap "echo '停止服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM
wait
