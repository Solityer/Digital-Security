#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"
CHECK_LOG="$LOG_DIR/check.log"
NETWORK_LOG="$LOG_DIR/network-diagnosis.log"

mkdir -p "$LOG_DIR"
: > "$CHECK_LOG"
: > "$NETWORK_LOG"

pass_count=0
fail_count=0

record() {
	local level="$1"
	local message="$2"
	printf '[%s] %s\n' "$level" "$message" | tee -a "$CHECK_LOG"
}

run_check() {
	local label="$1"
	local url="$2"
	local start_ms end_ms duration_ms body summary

	start_ms="$(date +%s%3N)"
	if body="$(curl -fsS --max-time 10 "$url" 2>&1)"; then
		end_ms="$(date +%s%3N)"
		duration_ms="$((end_ms - start_ms))"
		summary="$(printf '%s' "$body" | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' | cut -c1-120)"
		record PASS "$label | ${duration_ms}ms | $url | ${summary:-OK}"
		pass_count="$((pass_count + 1))"
	else
		end_ms="$(date +%s%3N)"
		duration_ms="$((end_ms - start_ms))"
		record FAIL "$label | ${duration_ms}ms | $url | $body"
		fail_count="$((fail_count + 1))"
	fi
}

{
	echo "# network diagnosis"
	date -Iseconds
	echo
	echo "## hostname -I"
	hostname -I 2>/dev/null || true
	echo
	echo "## ip route"
	ip route 2>/dev/null || true
	echo
	echo "## ss -ltnp"
	ss -ltnp 2>/dev/null | grep -E '(:3000|:8000)' || true
	echo
	echo "## curl -I http://127.0.0.1:3000"
	curl -I --max-time 10 http://127.0.0.1:3000 2>&1 || true
	echo
	echo "## curl http://127.0.0.1:3000/health"
	curl -sS --max-time 10 http://127.0.0.1:3000/health 2>&1 || true
	echo
	echo "## curl http://127.0.0.1:8000/health"
	curl -sS --max-time 10 http://127.0.0.1:8000/health 2>&1 || true
} > "$NETWORK_LOG"

run_check "前端首页" "http://127.0.0.1:3000"
run_check "前端诊断页" "http://127.0.0.1:3000/diagnostics"
run_check "前端代理健康检查" "http://127.0.0.1:3000/health"
run_check "后端健康检查" "http://127.0.0.1:8000/health"
run_check "资产列表" "http://127.0.0.1:8000/api/assets"
run_check "合约列表" "http://127.0.0.1:8000/api/contracts"
run_check "审计日志" "http://127.0.0.1:8000/api/audit/logs?limit=5"
run_check "风险事件" "http://127.0.0.1:8000/api/risks"

record INFO "检查完成: 通过 $pass_count 项, 失败 $fail_count 项"
record INFO "网络诊断日志: $NETWORK_LOG"

if [[ "$fail_count" -gt 0 ]]; then
	exit 1
fi
