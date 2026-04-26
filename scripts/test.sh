#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")/backend"
echo "运行后端测试..."
cd "$BACKEND_DIR"
if [ -f ".venv/bin/python" ]; then
  .venv/bin/python -m pytest tests/ -v --tb=short
else
  python3 -m pytest tests/ -v --tb=short
fi
