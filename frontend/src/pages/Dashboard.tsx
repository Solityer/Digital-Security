import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Database, FileText, Cpu, CheckCircle2, AlertTriangle, Activity,
  BarChart3, Shield, GitBranch, Zap, RefreshCw,
} from 'lucide-react'
import StatCard from '../components/StatCard'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  getHealth, getAssets, getContracts, getAuditLogs, getRisks,
} from '../api/endpoints'
import dayjs from 'dayjs'

interface HealthData {
  status: string
  modules?: Record<string, string>
  timestamp?: string
}
interface Asset {
  asset_id: string
  name: string
  industry: string
  status: string
  node_count?: number
  edge_count?: number
  created_at?: string
}
interface Contract {
  contract_id: string
  title: string
  provider: string
  consumer: string
  status: string
  created_at?: string
}
interface AuditLog {
  log_id: string
  timestamp: string
  username: string
  role?: string
  action: string
  target?: string
  result: string
  log_hash?: string
}
interface Risk {
  risk_id?: string
  event_type?: string
  description?: string
  severity?: string
  status?: string
  detected_at?: string
}

const statusLabel: Record<string, string> = {
  operational: '正常',
  degraded: '降级',
  error: '故障',
  ok: '正常',
  running: '运行中',
}

const moduleNames: Record<string, string> = {
  database: '数据库',
  graph_sdp: 'Graph-SDP',
  gcc_sdp: 'GCC-SDP',
  gs_ldp: 'GS-LDP',
  ndkd: 'NDKD',
  vpcs: 'VPCS查询',
  zkgcn: 'zkGCN推理',
  risk_engine: '风险引擎',
  audit: '审计系统',
}

const contractStatusMap: Record<string, { label: string; cls: string }> = {
  draft:      { label: '草稿',   cls: 'badge-gray' },
  pending:    { label: '待审核', cls: 'badge-yellow' },
  active:     { label: '已生效', cls: 'badge-green' },
  suspended:  { label: '已暂停', cls: 'badge-orange' },
  terminated: { label: '已终止', cls: 'badge-red' },
}

const resultMap: Record<string, { label: string; cls: string }> = {
  success: { label: '成功', cls: 'badge-green' },
  allow:   { label: '允许', cls: 'badge-green' },
  deny:    { label: '拒绝', cls: 'badge-red' },
  error:   { label: '错误', cls: 'badge-red' },
  warning: { label: '警告', cls: 'badge-yellow' },
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [health, setHealth] = useState<HealthData | null>(null)
  const [assets, setAssets] = useState<Asset[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [risks, setRisks] = useState<Risk[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [h, a, c, al, r] = await Promise.allSettled([
        getHealth(), getAssets(), getContracts(),
        getAuditLogs({ limit: 10 }), getRisks(),
      ])
      if (h.status === 'fulfilled') setHealth(h.value)
      if (a.status === 'fulfilled') setAssets(a.value?.assets ?? a.value ?? [])
      if (c.status === 'fulfilled') setContracts(c.value?.contracts ?? c.value ?? [])
      if (al.status === 'fulfilled') {
        const logs = al.value?.logs ?? al.value ?? []
        setAuditLogs(Array.isArray(logs) ? logs.slice(0, 10) : [])
      }
      if (r.status === 'fulfilled') setRisks(r.value?.risks ?? r.value ?? [])
    } finally {
      setLoading(false)
      setLastRefresh(dayjs().format('HH:mm:ss'))
    }
  }, [])

  useEffect(() => { load() }, [load])

  const totalNodes = assets.reduce((s, a) => s + (a.node_count ?? 0), 0)
  const activeContracts = contracts.filter((c) => c.status === 'active').length
  const criticalRisks = risks.filter((r) => r.severity === 'critical' || r.severity === 'high').length

  const modules = health?.modules ?? {}

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-tech">数智安行 · 总览驾驶舱</h1>
          <p className="text-slate-400 text-sm mt-1">
            图数据可信治理与智能流通平台 — 实时监控与管理中心
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="btn btn-secondary text-xs gap-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {lastRefresh ? `上次刷新 ${lastRefresh}` : '刷新'}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          icon={<Database className="w-5 h-5" />}
          title="数据资产总数"
          value={loading ? '-' : assets.length}
          subtitle="已登记资产"
          color="blue"
          loading={loading}
        />
        <StatCard
          icon={<GitBranch className="w-5 h-5" />}
          title="图节点总数"
          value={loading ? '-' : totalNodes.toLocaleString()}
          subtitle="所有资产合计"
          color="cyan"
          loading={loading}
        />
        <StatCard
          icon={<Cpu className="w-5 h-5" />}
          title="隐私计算任务"
          value={loading ? '-' : auditLogs.filter(l => l.action?.includes('privacy') || l.action?.includes('sdp') || l.action?.includes('ldp')).length}
          subtitle="近期执行次数"
          color="purple"
          loading={loading}
        />
        <StatCard
          icon={<CheckCircle2 className="w-5 h-5" />}
          title="验证成功率"
          value={loading ? '-' : (() => {
            const total = auditLogs.length
            const ok = auditLogs.filter(l => l.result === 'success' || l.result === 'allow').length
            return total > 0 ? `${Math.round(ok / total * 100)}%` : '-'
          })()}
          subtitle="审计日志统计"
          color="green"
          loading={loading}
        />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5" />}
          title="风险事件"
          value={loading ? '-' : criticalRisks}
          subtitle="高危/严重事件"
          color={criticalRisks > 0 ? 'red' : 'green'}
          loading={loading}
        />
        <StatCard
          icon={<FileText className="w-5 h-5" />}
          title="已生效合约"
          value={loading ? '-' : activeContracts}
          subtitle={`共 ${contracts.length} 份合约`}
          color="yellow"
          loading={loading}
        />
      </div>

      {/* Quick actions */}
      <div className="card-glow p-5">
        <h2 className="section-header">快捷操作</h2>
        <div className="flex flex-wrap gap-3">
          <button
            className="btn btn-primary gap-2"
            onClick={() => navigate('/scenarios')}
          >
            <BarChart3 className="w-4 h-4" />
            金融联合风控演示
          </button>
          <button
            className="btn btn-cyan gap-2"
            onClick={() => navigate('/scenarios')}
          >
            <Activity className="w-4 h-4" />
            医疗科研共享演示
          </button>
          <button
            className="btn btn-success gap-2"
            onClick={() => navigate('/scenarios')}
          >
            <Shield className="w-4 h-4" />
            政务数据开放演示
          </button>
          <button
            className="btn btn-secondary gap-2"
            onClick={() => navigate('/privacy')}
          >
            <Cpu className="w-4 h-4" />
            隐私计算实验室
          </button>
          <button
            className="btn btn-secondary gap-2"
            onClick={() => navigate('/vpcs')}
          >
            <Zap className="w-4 h-4" />
            VPCS加密查询
          </button>
          <button
            className="btn btn-secondary gap-2"
            onClick={() => navigate('/zkgcn')}
          >
            <CheckCircle2 className="w-4 h-4" />
            zkGCN可验证推理
          </button>
        </div>
      </div>

      {/* Tables row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Recent audit logs */}
        <div className="card-glow p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-header mb-0">近期审计日志</h2>
            <button className="text-xs text-blue-400 hover:text-blue-300" onClick={() => navigate('/audit')}>
              查看全部 →
            </button>
          </div>
          {loading ? (
            <LoadingSpinner message="加载中..." className="py-6" />
          ) : auditLogs.length === 0 ? (
            <p className="text-center text-slate-500 text-sm py-6">暂无审计日志</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>用户</th>
                    <th>操作</th>
                    <th>结果</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => {
                    const r = resultMap[log.result] ?? { label: log.result, cls: 'badge-gray' }
                    return (
                      <tr key={log.log_id}>
                        <td className="font-mono text-xs text-slate-400">
                          {log.timestamp ? dayjs(log.timestamp).format('MM-DD HH:mm:ss') : '-'}
                        </td>
                        <td className="font-medium text-slate-200">{log.username || '-'}</td>
                        <td className="text-slate-300 truncate max-w-32">{log.action || '-'}</td>
                        <td><span className={`badge ${r.cls}`}>{r.label}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent contracts */}
        <div className="card-glow p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-header mb-0">近期合约</h2>
            <button className="text-xs text-blue-400 hover:text-blue-300" onClick={() => navigate('/contracts')}>
              查看全部 →
            </button>
          </div>
          {loading ? (
            <LoadingSpinner message="加载中..." className="py-6" />
          ) : contracts.length === 0 ? (
            <p className="text-center text-slate-500 text-sm py-6">暂无合约记录</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>合约标题</th>
                    <th>提供方</th>
                    <th>需求方</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.slice(0, 8).map((c) => {
                    const s = contractStatusMap[c.status] ?? { label: c.status, cls: 'badge-gray' }
                    return (
                      <tr key={c.contract_id}>
                        <td className="font-medium text-slate-200 truncate max-w-36">{c.title}</td>
                        <td className="text-slate-400 truncate max-w-24">{c.provider}</td>
                        <td className="text-slate-400 truncate max-w-24">{c.consumer}</td>
                        <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* System status */}
      <div className="card-glow p-5">
        <h2 className="section-header">系统模块状态</h2>
        {loading ? (
          <LoadingSpinner message="检测中..." className="py-4" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
            {Object.keys(moduleNames).map((mod) => {
              const st = modules[mod] ?? (health?.status === 'ok' ? 'operational' : 'unknown')
              const isOk = st === 'operational' || st === 'ok' || st === 'running'
              return (
                <div
                  key={mod}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2.5"
                  style={{
                    background: isOk ? 'rgba(6,78,59,0.15)' : 'rgba(127,29,29,0.15)',
                    border: `1px solid ${isOk ? 'rgba(5,150,105,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      background: isOk ? '#10b981' : '#ef4444',
                      boxShadow: `0 0 6px ${isOk ? '#10b981' : '#ef4444'}`,
                    }}
                  />
                  <div>
                    <p className="text-xs font-semibold text-slate-300">{moduleNames[mod]}</p>
                    <p className={`text-xs ${isOk ? 'text-emerald-400' : 'text-red-400'}`}>
                      {statusLabel[st] ?? st}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
