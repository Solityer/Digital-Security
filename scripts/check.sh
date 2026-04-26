#!/usr/bin/env bash
set -e
curl -f http://127.0.0.1:8000/health
curl -f http://127.0.0.1:3000
echo "前后端连通性正常"
