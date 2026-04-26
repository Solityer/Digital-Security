import { useCallback, useEffect, useState } from 'react'
import { Activity, RefreshCw, CheckCircle2, XCircle } from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import { getHealth, getAssets, getContracts, getAuditLogs, getRisks } from '../api/endpoints'
import { safeString, toArray, toObject } from '../api/normalizers'

interface DiagnosticResult {
  label: string
  path: string
  status: 'OK' | 'FAIL'
  durationMs: number
  summary: string
  error?: string
}

function summarizeResponse(value: unknown): string {
  if (Array.isArray(value)) {
    return `数组 ${value.length} 项`
  }
  const data = toObject<Record<string, unknown>>(value, {})
  const items = toArray(data.items)
  if (items.length > 0) {
    return `items ${items.length} 项 / total ${safeString(data.total, '-')}`
  }
  if (data.status) {
    return `status=${safeString(data.status)}`
  }
  const keys = Object.keys(data)
  return keys.length > 0 ? `字段: ${keys.slice(0, 5).join(', ')}` : '空响应'
}

export default function SystemDiagnostics() {
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState<DiagnosticResult[]>([])

  const runDiagnostics = useCallback(async () => {
    setLoading(true)
    const checks = [
      { label: '健康检查', path: '/health', run: () => getHealth() },
      { label: '资产列表', path: '/api/assets', run: () => getAssets() },
      { label: '合约列表', path: '/api/contracts', run: () => getContracts() },
      { label: '审计日志', path: '/api/audit/logs?limit=5', run: () => getAuditLogs({ limit: 5 }) },
      { label: '风险事件', path: '/api/risks', run: () => getRisks() },
    ]

    const resolved = await Promise.all(checks.map(async (check) => {
      const start = Date.now()
      try {
        const data = await check.run()
        return {
          label: check.label,
          path: check.path,
          status: 'OK' as const,
          durationMs: Date.now() - start,
          summary: summarizeResponse(data),
        }
      } catch (err: unknown) {
        return {
          label: check.label,
          path: check.path,
          status: 'FAIL' as const,
          durationMs: Date.now() - start,
          summary: '请求失败',
          error: err instanceof Error ? err.message : '未知错误',
        }
      }
    }))

    setResults(resolved)
    setLoading(false)
  }, [])

  useEffect(() => { runDiagnostics() }, [runDiagnostics])

  const okCount = results.filter((item) => item.status === 'OK').length

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-tech">系统诊断</h1>
          <p className="text-slate-400 text-sm mt-0.5">比赛前快速确认核心接口可访问、可返回、可展示。</p>
        </div>
        <button onClick={runDiagnostics} className="btn btn-secondary gap-2" disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          重新检测
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: '检测接口数', value: String(results.length), color: '#3b82f6' },
          { label: '成功接口数', value: String(okCount), color: '#10b981' },
          { label: '失败接口数', value: String(results.length - okCount), color: '#ef4444' },
          { label: '当前状态', value: results.length > 0 && okCount === results.length ? '全部正常' : '需检查', color: okCount === results.length ? '#10b981' : '#f59e0b' },
        ].map((item) => (
          <div key={item.label} className="card-glow p-4 text-center">
            <p className="text-xl font-black font-mono" style={{ color: item.color }}>{item.value}</p>
            <p className="text-xs text-slate-500 mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="card-glow p-5">
        <h2 className="section-header">接口检测结果</h2>
        {loading ? (
          <LoadingSpinner message="正在检测系统接口..." className="py-12" size="lg" />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>接口</th>
                  <th>请求路径</th>
                  <th>状态</th>
                  <th>耗时</th>
                  <th>响应摘要</th>
                </tr>
              </thead>
              <tbody>
                {results.map((item) => (
                  <tr key={item.path}>
                    <td className="font-semibold text-slate-200">{item.label}</td>
                    <td className="font-mono text-xs text-slate-400">{item.path}</td>
                    <td>
                      {item.status === 'OK' ? (
                        <span className="badge badge-green"><CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />OK</span>
                      ) : (
                        <span className="badge badge-red"><XCircle className="w-3.5 h-3.5 inline mr-1" />FAIL</span>
                      )}
                    </td>
                    <td className="font-mono text-cyan-400">{item.durationMs} ms</td>
                    <td>
                      <div className="text-sm text-slate-300">{item.summary}</div>
                      {item.error ? <div className="text-xs text-red-300 mt-1">{item.error}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card-glow p-5">
        <h2 className="section-header">使用建议</h2>
        <div className="space-y-3 text-sm text-slate-300">
          <div className="flex items-start gap-2"><Activity className="w-4 h-4 text-blue-400 mt-0.5" />比赛开始前先打开本页，确保 5 个核心接口全部 OK。</div>
          <div className="flex items-start gap-2"><Activity className="w-4 h-4 text-blue-400 mt-0.5" />若某个接口 FAIL，可直接根据响应摘要判断是后端未启动、代理失败还是数据为空。</div>
          <div className="flex items-start gap-2"><Activity className="w-4 h-4 text-blue-400 mt-0.5" />若全部 OK，再切到 Dashboard、隐私实验室、VPCS 和 zkGCN 进行联调演示。</div>
        </div>
      </div>
    </div>
  )
}