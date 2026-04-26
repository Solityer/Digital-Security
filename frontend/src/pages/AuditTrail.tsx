import { useState, useEffect, useCallback } from 'react'
import {
  ScrollText, RefreshCw, Shield, ShieldAlert, CheckCircle2,
  XCircle, Filter, AlertTriangle,
} from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import { getAuditLogs, verifyAuditChain, tamperAuditDemo } from '../api/endpoints'
import dayjs from 'dayjs'

interface AuditLog {
  id: string
  timestamp: string
  username: string
  role?: string
  action: string
  target?: string
  result: string
  log_hash?: string
  prev_hash?: string
  chain_valid?: boolean
}

interface ChainVerifyResult {
  valid: boolean
  total_logs?: number
  verified_logs?: number
  broken_at?: string
  broken_log_id?: string
  broken_index?: number
  message?: string
}

const RESULT_MAP: Record<string, { label: string; cls: string }> = {
  success: { label: '成功', cls: 'badge-green' },
  allow:   { label: '允许', cls: 'badge-green' },
  deny:    { label: '拒绝', cls: 'badge-red' },
  error:   { label: '错误', cls: 'badge-red' },
  warning: { label: '警告', cls: 'badge-yellow' },
  tampered: { label: '已篡改', cls: 'badge-red' },
}

const ACTION_OPTIONS = ['', 'create_asset', 'delete_asset', 'query', 'export', 'login', 'evaluate_authz', 'run_privacy', 'run_vpcs', 'run_zkgcn']
const RESULT_OPTIONS = ['', 'success', 'deny', 'error', 'warning']

function ChainIndicator({ logs }: { logs: AuditLog[] }) {
  const blocks = logs.slice(0, 12)
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {blocks.map((log, i) => {
        const isBroken = log.chain_valid === false
        return (
          <div key={log.id} className="flex items-center gap-0.5">
            {i > 0 && (
              <div className={`w-4 h-0.5 ${isBroken ? 'bg-red-500' : 'bg-emerald-600/60'}`} />
            )}
            <div
              className={`w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold transition-colors`}
              style={{
                background: isBroken ? 'rgba(127,29,29,0.4)' : 'rgba(6,78,59,0.4)',
                border: `1px solid ${isBroken ? '#ef4444' : '#059669'}`,
                color: isBroken ? '#f87171' : '#34d399',
              }}
              title={`#${i + 1} ${log.log_hash?.slice(0, 8) ?? ''}`}
            >
              {i + 1}
            </div>
          </div>
        )
      })}
      {logs.length > 12 && (
        <span className="text-xs text-slate-500 ml-1">+{logs.length - 12}</span>
      )}
    </div>
  )
}

export default function AuditTrail() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [tamperLoading, setTamperLoading] = useState(false)
  const [chainResult, setChainResult] = useState<ChainVerifyResult | null>(null)
  const [tamperError, setTamperError] = useState('')

  // Filters
  const [filterUsername, setFilterUsername] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterResult, setFilterResult] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = {}
      if (filterUsername) params.username = filterUsername
      if (filterAction)   params.action = filterAction
      if (filterResult)   params.result = filterResult
      if (filterDateFrom) params.date_from = filterDateFrom
      if (filterDateTo)   params.date_to = filterDateTo
      const data = await getAuditLogs(params)
      setLogs(data?.items ?? data?.logs ?? data ?? [])
    } catch { setLogs([]) }
    finally { setLoading(false) }
  }, [filterUsername, filterAction, filterResult, filterDateFrom, filterDateTo])

  useEffect(() => { load() }, [load])

  const handleVerify = async () => {
    setVerifyLoading(true)
    setChainResult(null)
    try {
      const data = await verifyAuditChain()
      setChainResult(data)
    } catch {}
    finally { setVerifyLoading(false) }
  }

  const handleTamper = async () => {
    if (logs.length === 0) return
    setTamperLoading(true)
    setTamperError('')
    setChainResult(null)
    try {
      const midIdx = Math.floor(logs.length / 2)
      const logId = logs[midIdx]?.id
      if (!logId) throw new Error('无法找到日志')
      await tamperAuditDemo(logId)
      await load()
      // Re-verify after tamper
      const result = await verifyAuditChain()
      setChainResult(result)
    } catch (e: unknown) {
      setTamperError(e instanceof Error ? e.message : '篡改演示失败')
    }
    finally { setTamperLoading(false) }
  }

  const chainOk = chainResult?.valid

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-tech">审计追踪</h1>
          <p className="text-slate-400 text-sm mt-0.5">不可篡改的哈希链式审计日志，全程记录数据访问行为</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowFilters(f => !f)} className="btn btn-secondary gap-2">
            <Filter className="w-4 h-4" /> 筛选
          </button>
          <button onClick={load} disabled={loading} className="btn btn-secondary">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={handleVerify} disabled={verifyLoading} className="btn btn-success gap-2">
            {verifyLoading ? <LoadingSpinner size="sm" /> : <Shield className="w-4 h-4" />}
            {verifyLoading ? '验证中...' : '验证哈希链'}
          </button>
          <button onClick={handleTamper} disabled={tamperLoading || logs.length === 0} className="btn btn-danger gap-2">
            {tamperLoading ? <LoadingSpinner size="sm" /> : <AlertTriangle className="w-4 h-4" />}
            {tamperLoading ? '演示中...' : '篡改演示'}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="card-glow p-4 animate-slide-in">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="form-label">用户名</label>
              <input className="form-input" value={filterUsername} onChange={e => setFilterUsername(e.target.value)} placeholder="用户名..." />
            </div>
            <div>
              <label className="form-label">操作类型</label>
              <select className="form-input" value={filterAction} onChange={e => setFilterAction(e.target.value)}>
                {ACTION_OPTIONS.map(a => <option key={a} value={a}>{a || '全部'}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">结果</label>
              <select className="form-input" value={filterResult} onChange={e => setFilterResult(e.target.value)}>
                {RESULT_OPTIONS.map(r => <option key={r} value={r}>{r || '全部'}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">开始日期</label>
              <input type="date" className="form-input" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="form-label">结束日期</label>
              <input type="date" className="form-input" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={load} disabled={loading} className="btn btn-primary gap-2">
              <Filter className="w-4 h-4" /> 应用筛选
            </button>
            <button onClick={() => { setFilterUsername(''); setFilterAction(''); setFilterResult(''); setFilterDateFrom(''); setFilterDateTo('') }}
              className="btn btn-secondary">
              清除筛选
            </button>
          </div>
        </div>
      )}

      {/* Chain integrity */}
      <div className="card-glow p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-header mb-0">哈希链完整性</h2>
          {chainResult && (
            <div className={`flex items-center gap-2 badge text-sm px-4 py-2 ${chainOk ? 'badge-green' : 'badge-red'}`}>
              {chainOk
                ? <><CheckCircle2 className="w-4 h-4" /> 链完整</>
                : <><ShieldAlert className="w-4 h-4" /> 链已破坏</>
              }
            </div>
          )}
        </div>

        {tamperError && <p className="alert-error mb-3">{tamperError}</p>}

        {/* Chain blocks visualization */}
        {logs.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-slate-500 mb-2">日志区块链（最新 {Math.min(logs.length, 12)} 条）</p>
            <ChainIndicator logs={logs} />
          </div>
        )}

        {/* Chain verify result detail */}
        {chainResult && (
          <div className={`p-4 rounded-lg mt-3 ${chainOk ? 'alert-success' : 'alert-error'}`}>
            {chainOk ? (
              <div>
                <p className="font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" /> 哈希链验证通过
                </p>
                <p className="text-sm mt-1 opacity-80">
                  共验证 {chainResult.verified_logs ?? chainResult.total_logs ?? logs.length} 条日志，
                  哈希链完整，无篡改记录。
                </p>
              </div>
            ) : (
              <div>
                <p className="font-bold flex items-center gap-2">
                  <XCircle className="w-5 h-5" /> 哈希链验证失败 — 检测到篡改！
                </p>
                {chainResult.broken_log_id && (
                  <p className="text-sm mt-1 opacity-80">
                    链断裂位置：第 {(chainResult.broken_index ?? 0) + 1} 条日志
                    （ID: {chainResult.broken_log_id.slice(0, 16)}...）
                  </p>
                )}
                {chainResult.message && (
                  <p className="text-sm mt-0.5 opacity-70">{chainResult.message}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Audit log table */}
      <div className="card-glow p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-header mb-0">
            审计日志
            <span className="ml-2 text-slate-500 text-sm font-normal">({logs.length} 条)</span>
          </h2>
        </div>

        {loading ? (
          <LoadingSpinner message="加载审计日志..." className="py-10" />
        ) : logs.length === 0 ? (
          <div className="text-center py-10">
            <ScrollText className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500">暂无审计日志</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>时间戳</th>
                  <th>用户</th>
                  <th>角色</th>
                  <th>操作</th>
                  <th>目标</th>
                  <th>结果</th>
                  <th>日志哈希</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, idx) => {
                  const r = RESULT_MAP[log.result] ?? { label: log.result, cls: 'badge-gray' }
                  const isTampered = log.chain_valid === false || log.result === 'tampered'
                  return (
                    <tr key={log.id} className={isTampered ? 'bg-red-950/20' : ''}>
                      <td className="text-slate-500 text-xs">{idx + 1}</td>
                      <td className="font-mono text-xs text-slate-400">
                        {log.timestamp ? dayjs(log.timestamp).format('MM-DD HH:mm:ss') : '-'}
                      </td>
                      <td className="font-semibold text-slate-200">{log.username || '-'}</td>
                      <td className="text-xs text-slate-400">{log.role || '-'}</td>
                      <td className="text-slate-300 text-sm">{log.action || '-'}</td>
                      <td className="text-slate-400 text-xs truncate max-w-32">
                        {log.target || '-'}
                      </td>
                      <td>
                        <span className={`badge ${r.cls}`}>{r.label}</span>
                        {isTampered && (
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400 inline ml-1.5" />
                        )}
                      </td>
                      <td>
                        {log.log_hash ? (
                          <span className="hash-display text-xs" title={log.log_hash}>
                            {log.log_hash.slice(0, 12)}...
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stats */}
      {logs.length > 0 && (
        <div className="card-glow p-5">
          <h2 className="section-header">统计摘要</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: '总日志数', value: logs.length, color: '#3b82f6' },
              { label: '成功操作', value: logs.filter(l => l.result === 'success' || l.result === 'allow').length, color: '#10b981' },
              { label: '拒绝/失败', value: logs.filter(l => l.result === 'deny' || l.result === 'error').length, color: '#ef4444' },
              { label: '独立用户', value: new Set(logs.map(l => l.username)).size, color: '#a78bfa' },
            ].map(m => (
              <div key={m.label} className="text-center rounded-lg p-3" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b' }}>
                <p className="text-2xl font-black font-mono" style={{ color: m.color }}>{m.value}</p>
                <p className="text-xs text-slate-500 mt-1">{m.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
