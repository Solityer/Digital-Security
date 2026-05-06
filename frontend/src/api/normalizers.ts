const EMPTY_TEXT_TOKENS = new Set([
  '',
  'null',
  'undefined',
  '[object object]',
  'n/a',
  'na',
  '未指定',
])

export function toArray<T = any>(value: any, keys: string[] = []): T[] {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  if (Array.isArray(value?.items)) return value.items
  if (Array.isArray(value?.data)) return value.data
  if (Array.isArray(value?.assets)) return value.assets
  if (Array.isArray(value?.contracts)) return value.contracts
  if (Array.isArray(value?.logs)) return value.logs
  if (Array.isArray(value?.risks)) return value.risks
  if (Array.isArray(value?.scenarios)) return value.scenarios
  return []
}

export function toObject<T = any>(value: any, fallback: T): T {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  return fallback
}

export function getId(item: any): string {
  return String(item?.id ?? item?.asset_id ?? item?.contract_id ?? item?.log_id ?? item?.risk_id ?? item?.scenario_id ?? '')
}

export function safeNumber(value: any, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function safeString(value: any, fallback = ''): string {
  if (value === null || value === undefined) return fallback

  if (typeof value === 'string') {
    const normalized = value.trim()
    if (EMPTY_TEXT_TOKENS.has(normalized.toLowerCase())) return fallback
    return normalized || fallback
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => safeString(item, ''))
      .filter(Boolean)
    return normalized.length > 0 ? normalized.join(' / ') : fallback
  }

  return fallback
}

export function formatStatus(value: any, fallback = '待配置'): string {
  const status = safeString(value).toLowerCase()
  const statusMap: Record<string, string> = {
    active: '已生效',
    inactive: '未启用',
    pending: '待审批',
    draft: '草稿',
    suspended: '已暂停',
    terminated: '已终止',
    success: '成功',
    fail: '失败',
    failure: '失败',
    error: '异常',
    open: '待处理',
    resolved: '已解决',
    investigating: '调查中',
    allow: '允许',
    deny: '拒绝',
    ok: '正常',
    running: '运行中',
  }
  return statusMap[status] ?? safeString(value, fallback)
}

export function formatIndustry(value: any, fallback = '业务领域'): string {
  const industry = safeString(value).toLowerCase()
  const industryMap: Record<string, string> = {
    finance: '金融',
    medical: '医疗',
    government: '政务',
    social: '社会关系',
    enterprise: '企业治理',
    transportation: '交通',
  }
  return industryMap[industry] ?? safeString(value, fallback)
}

export function formatSensitivity(value: any, fallback = '待配置'): string {
  const level = safeNumber(value, NaN)
  if (!Number.isFinite(level)) return fallback
  const labelMap: Record<number, string> = {
    1: '低',
    2: '较低',
    3: '中',
    4: '高',
    5: '极高',
  }
  return labelMap[level] ?? `${level}`
}

export function formatRiskLevel(value: any, fallback = '待评估'): string {
  const level = safeString(value).toLowerCase()
  const riskMap: Record<string, string> = {
    critical: '严重',
    high: '高危',
    medium: '中危',
    low: '低危',
    info: '提示',
  }
  return riskMap[level] ?? safeString(value, fallback)
}

export function formatAction(value: any, fallback = '系统操作'): string {
  const action = safeString(value).toLowerCase()
  const actionMap: Record<string, string> = {
    create_asset: '资产登记',
    create_contract: '合约创建',
    activate_contract: '合约激活',
    evaluate_authz: '授权评估',
    run_privacy: '隐私计算任务执行',
    run_vpcs: 'VPCS 查询验证',
    run_zkgcn: 'zkGCN 推理验证',
    verify_chain: '审计链校验',
    query: '数据查询',
    export: '数据导出',
    login: '登录访问',
  }
  return actionMap[action] ?? safeString(value, fallback)
}

export function getTimestamp(item: any): string {
  return safeString(item?.timestamp ?? item?.detected_at ?? item?.created_at)
}

export function unwrapResult<T = Record<string, any>>(value: any): T {
  return toObject(value?.result, toObject(value, {} as T))
}

export function getGraphData(value: any): { nodes: any[]; edges: any[] } {
  const graph = toObject(
    value?.graph_snapshot ?? value?.graph ?? value?.noisy_graph ?? value?.result?.noisy_graph ?? value,
    {},
  )
  return {
    nodes: toArray(graph, ['nodes']),
    edges: toArray(graph, ['edges']),
  }
}