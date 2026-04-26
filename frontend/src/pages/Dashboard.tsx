import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import {
  Database, FileText, Cpu, CheckCircle2, AlertTriangle, Activity,
  BarChart3, Shield, GitBranch, Zap, RefreshCw, Brain, Layers,
} from 'lucide-react'
import StatCard from '../components/StatCard'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  getHealth, getAssets, getContracts, getAuditLogs, getRisks,
} from '../api/endpoints'
import { getId, safeNumber, safeString, toArray, toObject } from '../api/normalizers'
import dayjs from 'dayjs'

interface HealthData {
  status: string
  modules?: Record<string, string>
  timestamp?: string
}
interface Asset {
  asset_id?: string
  id?: string
  name: string
  industry: string
  status: string
  node_count?: number
  edge_count?: number
  created_at?: string
}
interface Contract {
  contract_id?: string
  id?: string
  title: string
  provider: string
  consumer: string
  status: string
  created_at?: string
}
interface AuditLog {
  log_id?: string
  id?: string
  timestamp?: string
  username?: string
  role?: string
  action?: string
  target?: string
  result?: string
}
interface Risk {
  risk_id?: string
  id?: string
  event_type?: string
  description?: string
  severity?: string
  status?: string
  detected_at?: string
  asset_name?: string
}

const STATUS_LABEL: Record<string, string> = {
  operational: '正常',
  degraded: '降级',
  error: '故障',
  ok: '正常',
  running: '运行中',
}

const MODULE_NAMES: Record<string, string> = {
  database: '数据库',
  graph_sdp: 'Graph-SDP',
  gcc_sdp: 'GCC-SDP',
  gs_ldp: 'GS-LDP',
  ndkd: 'NDKD',
  vpcs: 'VPCS 查询',
  zkgcn: 'zkGCN 推理',
  risk_engine: '风险引擎',
  audit: '审计系统',
}

const CONTRACT_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  draft:      { label: '草稿', cls: 'badge-gray' },
  pending:    { label: '待审批', cls: 'badge-yellow' },
  active:     { label: '已生效', cls: 'badge-green' },
  suspended:  { label: '已暂停', cls: 'badge-orange' },
  terminated: { label: '已终止', cls: 'badge-red' },
}

const RISK_SEVERITY_MAP: Record<string, { label: string; cls: string }> = {
  critical: { label: '严重', cls: 'badge-red' },
  high: { label: '高危', cls: 'badge-orange' },
  medium: { label: '中危', cls: 'badge-yellow' },
  low: { label: '低危', cls: 'badge-green' },
}

function buildBarOption(title: string, labels: string[], values: number[], color: string) {
  return {
    backgroundColor: 'transparent',
    title: { text: title, left: 'center', top: 0, textStyle: { color: '#94a3b8', fontSize: 11 } },
    grid: { left: 36, right: 12, top: 28, bottom: 22 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: '#64748b', fontSize: 9 },
      axisLine: { lineStyle: { color: '#1e293b' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#64748b', fontSize: 9 },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    series: [{
      type: 'bar',
      barMaxWidth: 28,
      data: values,
      itemStyle: { color, borderRadius: [4, 4, 0, 0] },
    }],
  }
}

function buildLineOption(labels: string[], values: number[]) {
  return {
    backgroundColor: 'transparent',
    grid: { left: 36, right: 12, top: 16, bottom: 24 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: '#64748b', fontSize: 9 },
      axisLine: { lineStyle: { color: '#1e293b' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#64748b', fontSize: 9 },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    series: [{
      type: 'line',
      data: values,
      smooth: true,
      lineStyle: { color: '#22d3ee', width: 2 },
      itemStyle: { color: '#22d3ee' },
      areaStyle: { color: '#22d3ee', opacity: 0.12 },
    }],
  }
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [health, setHealth] = useState<HealthData | null>(null)
  const [assets, setAssets] = useState<Asset[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [risks, setRisks] = useState<Risk[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState('')
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [h, a, c, al, r] = await Promise.allSettled([
        getHealth(), getAssets(), getContracts(),
        getAuditLogs({ limit: 16 }), getRisks(),
      ])
      if (h.status === 'fulfilled') setHealth(toObject(h.value, null))
      if (a.status === 'fulfilled') setAssets(toArray(a.value, ['items', 'assets']))
      if (c.status === 'fulfilled') setContracts(toArray(c.value, ['items', 'contracts']))
      if (al.status === 'fulfilled') setAuditLogs(toArray(al.value, ['items', 'logs']).slice(0, 16))
      if (r.status === 'fulfilled') setRisks(toArray(r.value, ['items', 'risks']))

      const failures = [h, a, c, al, r].filter((item) => item.status === 'rejected')
      if (failures.length > 0) {
        setLoadError(`部分模块数据加载失败，当前已展示可用内容（${failures.length}/5）。`)
      }
    } finally {
      setLoading(false)
      setLastRefresh(dayjs().format('HH:mm:ss'))
    }
  }, [])

  useEffect(() => { load() }, [load])

  const assetList = toArray<Asset>(assets)
  const contractList = toArray<Contract>(contracts)
  const auditLogList = toArray<AuditLog>(auditLogs)
  const riskList = toArray<Risk>(risks)

  const totalNodes = assetList.reduce((sum, asset) => sum + safeNumber(asset.node_count), 0)
  const totalEdges = assetList.reduce((sum, asset) => sum + safeNumber(asset.edge_count), 0)
  const activeContracts = contractList.filter((item) => safeString(item.status) === 'active').length
  const privacyTasks = auditLogList.filter((item) => /graph-sdp|gcc-sdp|gs-ldp|ndkd|graphsdp|gccc|运行graph|运行gcc|运行gs|运行ndkd/i.test(safeString(item.action))).length
  const auditPassRate = auditLogList.length > 0
    ? `${Math.round((auditLogList.filter((item) => safeString(item.result) === 'success').length / auditLogList.length) * 100)}%`
    : '-'
  const vpcsSuccess = auditLogList.filter((item) => /vpcs/i.test(safeString(item.action)) && safeString(item.result) === 'success').length
  const zkgcnSuccess = auditLogList.filter((item) => /zkgcn/i.test(safeString(item.action)) && safeString(item.result) === 'success').length
  const riskEvents = riskList.length

  const modules = health?.modules ?? {}
  const industryCounts = Object.entries(assetList.reduce((acc, asset) => {
    const key = safeString(asset.industry, 'other')
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {} as Record<string, number>))
  const contractStatusCounts = Object.entries(contractList.reduce((acc, contract) => {
    const key = safeString(contract.status, 'draft')
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {} as Record<string, number>))
  const riskSeverityCounts = Object.entries(riskList.reduce((acc, risk) => {
    const key = safeString(risk.severity, 'low')
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {} as Record<string, number>))

  const auditTrendMap = auditLogList.reduce((acc, log) => {
    const key = log.timestamp ? dayjs(log.timestamp).format('MM-DD') : '未知'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
  const auditTrendLabels = Object.keys(auditTrendMap)
  const auditTrendValues = auditTrendLabels.map((label) => auditTrendMap[label])

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-tech">总览驾驶舱</h1>
          <p className="text-slate-400 text-sm mt-1">聚焦资产治理、可信流通、隐私计算、风险治理与审计验证的运行总览</p>
        </div>
        <button onClick={load} disabled={loading} className="btn btn-secondary text-xs gap-2">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {lastRefresh ? `上次刷新 ${lastRefresh}` : '刷新'}
        </button>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <div className="flex items-center justify-between gap-4">
            <span>{loadError}</span>
            <button onClick={load} className="text-amber-100 underline underline-offset-2">重试</button>
          </div>
        </div>
      ) : null}

      <div className="card-glow p-5">
        <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-6">
          <div>
            <h2 className="section-header">平台简介</h2>
            <p className="text-slate-300 leading-7 text-sm">
              数图信枢面向图数据可信治理与智能流通场景，整合数据资产登记、共享合约、隐私计算、可验证查询、可验证推理、风险监控与审计追踪能力，形成可直接用于答辩讲解的端到端闭环平台。
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
              {[
                { label: '资产治理', value: '确权、快照、标签', color: '#3b82f6' },
                { label: '可信流通', value: '合约、授权、审批', color: '#22d3ee' },
                { label: '隐私计算', value: '四类算法台', color: '#a78bfa' },
                { label: '可验证查询', value: 'VPCS proof 验证', color: '#10b981' },
                { label: '可验证推理', value: 'zkGCN 零知识证明', color: '#f59e0b' },
                { label: '风险与审计', value: '预警、链验、追踪', color: '#ef4444' },
              ].map((item) => (
                <div key={item.label} className="rounded-lg p-3" style={{ background: `${item.color}12`, border: `1px solid ${item.color}30` }}>
                  <p className="text-sm font-semibold" style={{ color: item.color }}>{item.label}</p>
                  <p className="text-xs text-slate-500 mt-1">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <h2 className="section-header">快捷入口</h2>
            <div className="grid grid-cols-2 gap-3">
              <button className="btn btn-primary gap-2 justify-center" onClick={() => navigate('/assets')}><Database className="w-4 h-4" /> 新建资产</button>
              <button className="btn btn-cyan gap-2 justify-center" onClick={() => navigate('/contracts')}><FileText className="w-4 h-4" /> 新建合约</button>
              <button className="btn btn-secondary gap-2 justify-center" onClick={() => navigate('/privacy')}><Cpu className="w-4 h-4" /> 运行 Graph-SDP</button>
              <button className="btn btn-secondary gap-2 justify-center" onClick={() => navigate('/vpcs')}><Zap className="w-4 h-4" /> 执行 VPCS 查询</button>
              <button className="btn btn-secondary gap-2 justify-center" onClick={() => navigate('/zkgcn')}><Brain className="w-4 h-4" /> 执行 zkGCN 推理</button>
              <button className="btn btn-success gap-2 justify-center" onClick={() => navigate('/scenarios')}><BarChart3 className="w-4 h-4" /> 进入场景演示</button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
        <StatCard icon={<Database className="w-5 h-5" />} title="数据资产总数" value={loading ? '-' : assetList.length} subtitle="已登记资产" color="blue" loading={loading} />
        <StatCard icon={<GitBranch className="w-5 h-5" />} title="图节点总数" value={loading ? '-' : totalNodes.toLocaleString()} subtitle="全资产合计" color="cyan" loading={loading} />
        <StatCard icon={<Layers className="w-5 h-5" />} title="图边总数" value={loading ? '-' : totalEdges.toLocaleString()} subtitle="全资产合计" color="purple" loading={loading} />
        <StatCard icon={<FileText className="w-5 h-5" />} title="已生效合约" value={loading ? '-' : activeContracts} subtitle={`共 ${contractList.length} 份`} color="yellow" loading={loading} />
        <StatCard icon={<AlertTriangle className="w-5 h-5" />} title="风险事件数" value={loading ? '-' : riskEvents} subtitle="当前监控事件" color={riskEvents > 0 ? 'red' : 'green'} loading={loading} />
        <StatCard icon={<CheckCircle2 className="w-5 h-5" />} title="审计通过率" value={loading ? '-' : auditPassRate} subtitle="近期审计验证" color="green" loading={loading} />
        <StatCard icon={<Cpu className="w-5 h-5" />} title="隐私计算任务" value={loading ? '-' : privacyTasks} subtitle="近期执行次数" color="purple" loading={loading} />
        <StatCard icon={<Shield className="w-5 h-5" />} title="VPCS / zkGCN" value={loading ? '-' : `${vpcsSuccess}/${zkgcnSuccess}`} subtitle="成功执行次数" color="blue" loading={loading} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="card-glow p-4">
          <ReactECharts option={buildBarOption('资产行业分布', industryCounts.map(([key]) => key), industryCounts.map(([, value]) => value), '#3b82f6')} style={{ height: 220 }} />
        </div>
        <div className="card-glow p-4">
          <ReactECharts option={buildBarOption('合约状态分布', contractStatusCounts.map(([key]) => CONTRACT_STATUS_MAP[key]?.label ?? key), contractStatusCounts.map(([, value]) => value), '#10b981')} style={{ height: 220 }} />
        </div>
        <div className="card-glow p-4">
          <ReactECharts option={buildBarOption('风险等级分布', riskSeverityCounts.map(([key]) => RISK_SEVERITY_MAP[key]?.label ?? key), riskSeverityCounts.map(([, value]) => value), '#f97316')} style={{ height: 220 }} />
        </div>
        <div className="card-glow p-4">
          <p className="section-header">审计事件趋势</p>
          {auditTrendLabels.length > 0 ? <ReactECharts option={buildLineOption(auditTrendLabels, auditTrendValues)} style={{ height: 190 }} /> : <LoadingSpinner className="py-10" />}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card-glow p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-header mb-0">最近资产登记</h2>
            <button className="text-xs text-blue-400 hover:text-blue-300" onClick={() => navigate('/assets')}>查看全部 →</button>
          </div>
          {loading ? <LoadingSpinner message="加载中..." className="py-8" /> : (
            <div className="space-y-3">
              {assetList.slice(0, 5).map((asset) => (
                <div key={getId(asset)} className="rounded-lg px-4 py-3 flex items-center justify-between" style={{ background: 'rgba(15,23,42,0.65)', border: '1px solid #1e293b' }}>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{asset.name}</p>
                    <p className="text-xs text-slate-500 mt-1">{safeString(asset.industry)} · {safeNumber(asset.node_count)} 节点 / {safeNumber(asset.edge_count)} 边</p>
                  </div>
                  <span className="badge badge-blue text-xs">{asset.created_at ? dayjs(asset.created_at).format('MM-DD') : '刚刚'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card-glow p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-header mb-0">最近合约激活</h2>
            <button className="text-xs text-blue-400 hover:text-blue-300" onClick={() => navigate('/contracts')}>查看全部 →</button>
          </div>
          {loading ? <LoadingSpinner message="加载中..." className="py-8" /> : (
            <div className="space-y-3">
              {contractList.slice(0, 5).map((contract) => {
                const status = CONTRACT_STATUS_MAP[safeString(contract.status)] ?? { label: safeString(contract.status), cls: 'badge-gray' }
                return (
                  <div key={getId(contract)} className="rounded-lg px-4 py-3 flex items-center justify-between" style={{ background: 'rgba(15,23,42,0.65)', border: '1px solid #1e293b' }}>
                    <div>
                      <p className="text-sm font-semibold text-slate-200">{contract.title}</p>
                      <p className="text-xs text-slate-500 mt-1">{contract.provider} → {contract.consumer}</p>
                    </div>
                    <span className={`badge ${status.cls}`}>{status.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card-glow p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-header mb-0">最近审计事件</h2>
            <button className="text-xs text-blue-400 hover:text-blue-300" onClick={() => navigate('/audit')}>查看全部 →</button>
          </div>
          {loading ? <LoadingSpinner message="加载中..." className="py-8" /> : (
            <div className="space-y-3">
              {auditLogList.slice(0, 5).map((log) => (
                <div key={getId(log)} className="rounded-lg px-4 py-3" style={{ background: 'rgba(15,23,42,0.65)', border: '1px solid #1e293b' }}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-200 truncate">{safeString(log.action, '-')}</p>
                    <span className={`badge ${safeString(log.result) === 'success' ? 'badge-green' : 'badge-yellow'}`}>{safeString(log.result, '-')}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{safeString(log.username, '-')} · {log.timestamp ? dayjs(log.timestamp).format('MM-DD HH:mm:ss') : '-'}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card-glow p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-header mb-0">最近风险预警</h2>
            <button className="text-xs text-blue-400 hover:text-blue-300" onClick={() => navigate('/risks')}>查看全部 →</button>
          </div>
          {loading ? <LoadingSpinner message="加载中..." className="py-8" /> : (
            <div className="space-y-3">
              {riskList.slice(0, 5).map((risk) => {
                const severity = RISK_SEVERITY_MAP[safeString(risk.severity)] ?? { label: safeString(risk.severity), cls: 'badge-gray' }
                return (
                  <div key={getId(risk)} className="rounded-lg px-4 py-3" style={{ background: 'rgba(15,23,42,0.65)', border: '1px solid #1e293b' }}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-200 truncate">{safeString(risk.event_type, '-')}</p>
                      <span className={`badge ${severity.cls}`}>{severity.label}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{safeString(risk.asset_name, '未关联资产')} · {risk.detected_at ? dayjs(risk.detected_at).format('MM-DD HH:mm:ss') : '-'}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="card-glow p-5">
        <h2 className="section-header">系统模块状态</h2>
        {loading ? (
          <LoadingSpinner message="检测中..." className="py-4" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
            {Object.keys(MODULE_NAMES).map((mod) => {
              const state = modules[mod] ?? (health?.status === 'ok' ? 'operational' : 'unknown')
              const isOk = state === 'operational' || state === 'ok' || state === 'running'
              return (
                <div key={mod} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5" style={{ background: isOk ? 'rgba(6,78,59,0.15)' : 'rgba(127,29,29,0.15)', border: `1px solid ${isOk ? 'rgba(5,150,105,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: isOk ? '#10b981' : '#ef4444', boxShadow: `0 0 6px ${isOk ? '#10b981' : '#ef4444'}` }} />
                  <div>
                    <p className="text-xs font-semibold text-slate-300">{MODULE_NAMES[mod]}</p>
                    <p className={`text-xs ${isOk ? 'text-emerald-400' : 'text-red-400'}`}>{STATUS_LABEL[state] ?? state}</p>
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
