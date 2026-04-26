export const arr = <T = any>(v: any): T[] => Array.isArray(v) ? v : []

export const obj = <T = Record<string, any>>(v: any): T => (
  v && typeof v === 'object' && !Array.isArray(v) ? v : {} as T
)

export const num = (v: any, fallback = 0) => (
  Number.isFinite(Number(v)) ? Number(v) : fallback
)

export const str = (v: any, fallback = '') => (
  v === null || v === undefined ? fallback : String(v)
)