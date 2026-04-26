#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_DIR/backend"
LOG_DIR="$PROJECT_DIR/logs"
SMOKE_LOG="$LOG_DIR/smoke-api.log"
PYTHON_BIN="$BACKEND_DIR/.venv/bin/python"
API_BASE="${API_BASE:-http://127.0.0.1:8000}"

mkdir -p "$LOG_DIR"
: > "$SMOKE_LOG"

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "缺少 Python 虚拟环境，请先运行 bash scripts/dev.sh" >&2
  exit 1
fi

pass_count=0

record() {
  printf '%s\n' "$1" | tee -a "$SMOKE_LOG"
}

get_json() {
  curl -fsS --max-time 20 "$1"
}

post_json() {
  local url="$1"
  local payload="$2"
  curl -fsS --max-time 60 -H 'Content-Type: application/json' -d "$payload" "$url"
}

extract_first_asset_id() {
  "$PYTHON_BIN" -c 'import json,sys; data=json.load(sys.stdin); items=data.get("items") or data.get("assets") or []; print(items[0].get("asset_id") or items[0].get("id") if items else "")'
}

extract_source_target() {
  "$PYTHON_BIN" -c '
import json, sys
data = json.load(sys.stdin)
graph = data.get("graph") or data.get("graph_snapshot") or data
nodes = graph.get("nodes") or []
def node_name(node, fallback):
    if isinstance(node, dict):
        return str(node.get("id") or node.get("name") or node.get("label") or fallback)
    return str(node)
if len(nodes) < 2:
    print("", "", sep="\t")
else:
    print(node_name(nodes[0], "node-1"), node_name(nodes[-1], f"node-{len(nodes)}"), sep="\t")
'
}

run_step() {
  local label="$1"
  local method="$2"
  local url="$3"
  local payload="${4:-}"
  local body

  if [[ "$method" == "GET" ]]; then
    body="$(get_json "$url")"
  else
    body="$(post_json "$url" "$payload")"
  fi

  record "[PASS] $label | $method $url"
  record "$(printf '%s' "$body" | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' | cut -c1-220)"
  pass_count="$((pass_count + 1))"
}

record "Smoke API started at $(date -Iseconds)"

assets_json="$(get_json "$API_BASE/api/assets")"
asset_id="$(printf '%s' "$assets_json" | extract_first_asset_id)"
if [[ -z "$asset_id" ]]; then
  echo "未找到可用资产，无法执行 smoke API。" >&2
  exit 1
fi

graph_json="$(post_json "$API_BASE/api/assets/$asset_id/graph/generate?seed=42" '{}')"
IFS=$'\t' read -r source_node target_node <<< "$(printf '%s' "$graph_json" | extract_source_target)"
if [[ -z "$source_node" || -z "$target_node" ]]; then
  echo "未能解析图节点，无法执行 VPCS 查询。" >&2
  exit 1
fi

run_step "健康检查" GET "$API_BASE/health"
run_step "资产列表" GET "$API_BASE/api/assets"
run_step "合约列表" GET "$API_BASE/api/contracts"
run_step "审计日志" GET "$API_BASE/api/audit/logs?limit=5"
run_step "审计链校验" POST "$API_BASE/api/audit/verify-chain" '{}'
run_step "风险列表" GET "$API_BASE/api/risks"
run_step "风险评估" POST "$API_BASE/api/risks/evaluate" "{\"asset_id\": $asset_id, \"user_id\": 1, \"event_type\": \"unauthorized_access\", \"context\": {\"authorization\": false, \"verify_result\": false, \"privacy_budget_used\": 1.2, \"privacy_budget_limit\": 1.0}}"
run_step "风险报告" POST "$API_BASE/api/risks/report" '{}'
run_step "Graph-SDP" POST "$API_BASE/api/privacy/graph-sdp" "{\"asset_id\": $asset_id, \"epsilon\": 1.0, \"L\": 10}"
run_step "GCC-SDP" POST "$API_BASE/api/privacy/gcc-sdp" "{\"asset_id\": $asset_id, \"epsilon\": 1.0}"
run_step "GS-LDP" POST "$API_BASE/api/privacy/gs-ldp" "{\"asset_id\": $asset_id, \"epsilon\": 2.0, \"randomize_edges\": true, \"randomize_attributes\": true, \"edge_flip_prob\": 0.2, \"attr_noise_scale\": 0.2}"
run_step "NDKD" POST "$API_BASE/api/privacy/ndkd" "{\"asset_id\": $asset_id, \"k\": 3, \"epsilon\": 1.0}"
run_step "VPCS 查询" POST "$API_BASE/api/vpcs/query" "{\"asset_id\": $asset_id, \"source_node\": \"$source_node\", \"target_node\": \"$target_node\", \"cost_threshold\": 50, \"time_threshold\": 50, \"distance_constraint\": 50, \"budget\": 50}"
run_step "VPCS 篡改演示" POST "$API_BASE/api/vpcs/tamper-demo" "{\"asset_id\": $asset_id, \"source_node\": \"$source_node\", \"target_node\": \"$target_node\", \"cost_threshold\": 50, \"time_threshold\": 50, \"distance_constraint\": 50, \"budget\": 50}"
run_step "zkGCN 推理" POST "$API_BASE/api/zkgcn/infer" "{\"asset_id\": $asset_id, \"layers\": 2, \"hidden_dim\": 64, \"model_type\": \"gcn\"}"
run_step "zkGCN 篡改演示" POST "$API_BASE/api/zkgcn/tamper-demo" "{\"asset_id\": $asset_id, \"layers\": 2, \"hidden_dim\": 64, \"model_type\": \"gcn\"}"
run_step "场景列表" GET "$API_BASE/api/demo/scenarios"
run_step "金融场景运行" POST "$API_BASE/api/demo/run/finance" '{}'

record "Smoke API completed. Total passed: $pass_count"