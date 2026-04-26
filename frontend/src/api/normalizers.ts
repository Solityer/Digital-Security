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
  return String(value)
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