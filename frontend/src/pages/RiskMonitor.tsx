import { useState, useEffect, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  AlertTriangle, Shield, RefreshCw, Play, FileText,
  CheckCircle2, X, TrendingUp, Filter,
} from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import { getRisks, evaluateRisk, getRiskReport } from '../api/endpoints'
import { getId, safeNumber, safeString, toArray, toObject } from '../api/normalizers'
import dayjs from 'dayjs'

interface RiskEvent {
  id?: string
  risk_id?: string
  event_type?: string
  description?: string
  severity?: string
  status?: string
  detected_at?: string
  created_at?: string
  asset_id?: string
  asset_name?: string
  username?: string
  score?: number
  risk_score?: number
}

interface RiskReport {
  total_events?: number
  critical_count?: number
  high_count?: number
  medium_count?: number
  low_count?: number
  risk_score?: number
  trend?: string
  recommendations?: string[]
  summary?: string
}

const SEVERITY_MAP: Record<string, { label: string; cls: string; color: string; order: number }> = {
  critical: { label: '严重', cls: 'badge-red', color: '#ef4444', order: 0 },
  high: { label: '高危', cls: 'badge-orange', color: '#f97316', order: 1 },
  medium: { label: '中危', cls: 'badge-yellow', color: '#f59e0b', order: 2 },
  low: { label: '低危', cls: 'badge-green', color: '#10b981', order: 3 },
  info: { label: '提示', cls: 'badge-blue', color: '#3b82f6', order: 4 },
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  open: { label: '待处理', cls: 'badge-red' },
  investigating: { label: '调查中', cls: 'badge-yellow' },
  resolved: { label: '已解决', cls: 'badge-green' },
  false_positive: { label: '误报', cls: 'badge-gray' },
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  anomaly_access: '异常访问',
  unauthorized_query: '越权查询',
  privacy_budget_exceeded: '隐私预算超限',
  proof_verify_failed: '证明验证失败',
  abnormal_export: '异常导出',
  chain_tamper: '审计链异常',
}

const RISK_RULES = [
  { id: 'r001', name: '高频敏感查询', desc: '单用户 10 分钟内查询敏感字段超过阈值', active: true, severity: 'high' },
  { id: 'r002', name: '越权访问检测', desc: '用户访问超出合约授权范围的数据字段', active: true, severity: 'critical' },
  { id: 'r003', name: '隐私预算超限', desc: '单合约累计隐私预算消耗超过设定上限', active: true, severity: 'high' },
  { id: 'r004', name: '异常时间段访问', desc: '非工作时间的大规模数据访问行为', active: true, severity: 'medium' },
  { id: 'r005', name: '证明验证异常', desc: 'VPCS 或 zkGCN 证明验证连续失败', active: true, severity: 'critical' },
  { id: 'r006', name: '审计链破坏告警', desc: '哈希链验证失败时自动触发链路告警', active: true, severity: 'critical' },
]

function buildGaugeOption(score: number) {
  const color = score >= 80 ? '#ef4444' : score >= 60 ? '#f97316' : score >= 40 ? '#f59e0b' : '#10b981'
  return {
    backgroundColor: 'transparent',
    series: [{
      type: 'gauge',
      startAngle: 210,
      endAngle: -30,
      min: 0,
      max: 100,
      radius: '90%',
      pointer: { length: '60%', width: 4, itemStyle: { color } },
      axisLine: { lineStyle: { width: 18, color: [[0.4, '#10b981'], [0.6, '#f59e0b'], [0.8, '#f97316'], [1, '#ef4444']] } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { color: '#64748b', fontSize: 9 },
      detail: { formatter: (value: number) => `${value.toFixed(0)}`, color, fontSize: 28, fontWeight: 'bold', offsetCenter: [0, '30%'] },
      data: [{ value: score, name: '风险评分' }],
      title: { color: '#94a3b8', fontSize: 11, offsetCenter: [0, '55%'] },
    }],
  }
}

function buildTrendOption(trendData: { date: string; score: number }[]) {
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 16, top: 16, bottom: 32 },
    xAxis: {
      type: 'category',
      data: trendData.map((item) => item.date),
      axisLabel: { color: '#64748b', fontSize: 9 },
      axisLine: { lineStyle: { color: '#1e293b' } },
    },
    yAxis: {
      type: 'value', min: 0, max: 100,
      axisLabel: { color: '#64748b', fontSize: 9 },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    series: [{
      type: 'line',
      data: trendData.map((item) => item.score),
      smooth: true,
      lineStyle: { color: '#f97316', width: 2 },
      itemStyle: { color: '#f97316' },
      areaStyle: { color: '#f97316', opacity: 0.12 },
      markLine: {
        data: [{ yAxis: 60, label: { formatter: '警戒线', color: '#f59e0b' }, lineStyle: { color: '#f59e0b', type: 'dashed' } }],
      },
    }],
  }
}

export default function RiskMonitor() {
  const [risks, setRisks] = useState<RiskEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [evalLoading, setEvalLoading] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [riskScore, setRiskScore] = useState(0)
  const [report, setReport] = useState<RiskReport | null>(null)
  const [showReport, setShowReport] = useState(false)
  const [trendData, setTrendData] = useState<{ date: string; score: number }[]>([])
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [severityFilter, setSeverityFilter] = useState('')
  const [eventTypeFilter, setEventTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const params: Record<string, unknown> = {}
      if (severityFilter) params.severity = severityFilter
      if (eventTypeFilter) params.event_type = eventTypeFilter
      if (statusFilter) params.status = statusFilter

      const data = await getRisks(params)
      const riskList = toArray<RiskEvent>(data, ['items', 'risks'])
      setRisks(riskList)

      if (data?.risk_score != null) {
        setRiskScore(safeNumber(data.risk_score))
      } else {
        const weights: Record<string, number> = { critical: 30, high: 18, medium: 10, low: 4, info: 1 }
        const computed = riskList.reduce((sum, item) => sum + (weights[safeString(item.severity, 'info')] ?? 1), 0)
        setRiskScore(Math.min(100, computed))
      }

      const baseScore = data?.risk_score != null ? safeNumber(data.risk_score) : Math.min(100, riskList.length * 12)
      setTrendData(Array.from({ length: 7 }, (_, index) => ({
        date: dayjs().subtract(6 - index, 'day').format('MM-DD'),
        score: Math.max(10, Math.min(100, Math.round(baseScore - 12 + index * 3))),
      })))
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : '风险事件加载失败')
      setRisks([])
    } finally {
      setLoading(false)
    }
  }, [severityFilter, eventTypeFilter, statusFilter])

  useEffect(() => { load() }, [load])

  const handleEvaluate = async () => {
    setEvalLoading(true)
    setActionFeedback(null)
    try {
      const data = await evaluateRisk({
        event_type: 'anomaly_access',
        context: {
          access_frequency: 120,
          frequency_threshold: 100,
          authorization: 'valid',
          privacy_budget_used: 1.2,
          privacy_budget_limit: 1.0,
          verify_result: true,
          quality_score: 0.84,
          contract_status: 'active',
        },
      })
      if (data?.risk_score != null) setRiskScore(safeNumber(data.risk_score))
      setActionFeedback({ type: 'success', text: safeString(data?.message, '风险评估已完成，评分与事件列表已刷新。') })
      await load()
    } catch (err: unknown) {
      setActionFeedback({ type: 'error', text: err instanceof Error ? err.message : '风险评估失败' })
    } finally {
      setEvalLoading(false)
    }
  }

  const handleReport = async () => {
    setReportLoading(true)
    setActionFeedback(null)
    try {
      const data = await getRiskReport()
      setReport(toObject<RiskReport>(data, {} as RiskReport))
      setShowReport(true)
      setActionFeedback({ type: 'info', text: '风险分析报告已生成，可查看综合评估与处置建议。' })
    } catch (err: unknown) {
      setActionFeedback({ type: 'error', text: err instanceof Error ? err.message : '风险报告生成失败' })
    } finally {
      setReportLoading(false)
    }
  }

  const riskList = toArray<RiskEvent>(risks)
  const sortedRisks = [...riskList].sort((a, b) =>
    (SEVERITY_MAP[safeString(a.severity, 'info')]?.order ?? 99) - (SEVERITY_MAP[safeString(b.severity, 'info')]?.order ?? 99),
  )

  const eventTypeOptions = Array.from(new Set(riskList.map((item) => safeString(item.event_type)).filter(Boolean)))
  const openCount = riskList.filter((item) => safeString(item.status) === 'open').length
  const criticalCount = riskList.filter((item) => safeString(item.severity) === 'critical').length
  const highCount = riskList.filter((item) => safeString(item.severity) === 'high').length

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-tech">风险监控预警</h1>
          <p className="text-slate-400 text-sm mt-0.5">对访问行为、隐私预算、证明验证与审计异常进行联动监测</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="btn btn-secondary gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
          </button>
          <button onClick={handleEvaluate} disabled={evalLoading} className="btn btn-primary gap-2">
            {evalLoading ? <LoadingSpinner size="sm" /> : <Play className="w-4 h-4" />}
            {evalLoading ? '评估中...' : '执行风险评估'}
          </button>
          <button onClick={handleReport} disabled={reportLoading} className="btn btn-cyan gap-2">
            {reportLoading ? <LoadingSpinner size="sm" /> : <FileText className="w-4 h-4" />}
            {reportLoading ? '生成中...' : '生成分析报告'}
          </button>
        </div>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <div className="flex items-center justify-between gap-4">
            <span>{loadError}</span>
            <button onClick={load} className="underline underline-offset-2">重试</button>
          </div>
        </div>
      ) : null}

      {actionFeedback ? (
        <div className={actionFeedback.type === 'error' ? 'alert-error' : actionFeedback.type === 'success' ? 'alert-success' : 'alert-info'}>
          <p className="text-sm">{actionFeedback.text}</p>
        </div>
      ) : null}

      <div className="card-glow p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-cyan-400" />
          <h2 className="section-header mb-0">筛选条件</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="form-label">风险等级</label>
            <select className="form-input" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
              <option value="">全部等级</option>
              {Object.entries(SEVERITY_MAP).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">事件类型</label>
            <select className="form-input" value={eventTypeFilter} onChange={(event) => setEventTypeFilter(event.target.value)}>
              <option value="">全部类型</option>
              {eventTypeOptions.map((item) => <option key={item} value={item}>{EVENT_TYPE_LABELS[item] ?? item}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">处置状态</label>
            <select className="form-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">全部状态</option>
              {Object.entries(STATUS_MAP).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button className="btn btn-secondary w-full" onClick={() => { setSeverityFilter(''); setEventTypeFilter(''); setStatusFilter('') }}>清空筛选</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-glow p-5 flex flex-col items-center">
          <h3 className="section-header">当前风险评分</h3>
          {loading ? <LoadingSpinner className="py-8" /> : (
            <>
              <ReactECharts option={buildGaugeOption(riskScore)} style={{ height: 200, width: '100%' }} />
              <span className={`badge text-sm ${riskScore >= 80 ? 'badge-red' : riskScore >= 60 ? 'badge-orange' : riskScore >= 40 ? 'badge-yellow' : 'badge-green'}`}>
                {riskScore >= 80 ? '严重威胁' : riskScore >= 60 ? '高风险' : riskScore >= 40 ? '中风险' : '低风险'}
              </span>
            </>
          )}
        </div>

        <div className="card-glow p-5">
          <h3 className="section-header">7 日风险趋势</h3>
          <ReactECharts option={buildTrendOption(trendData)} style={{ height: 200 }} />
        </div>

        <div className="card-glow p-5">
          <h3 className="section-header">风险摘要</h3>
          <div className="space-y-3">
            {[
              { label: '待处理事件', value: openCount, color: '#ef4444', icon: AlertTriangle },
              { label: '严重事件', value: criticalCount, color: '#f97316', icon: AlertTriangle },
              { label: '高危事件', value: highCount, color: '#f59e0b', icon: TrendingUp },
              { label: '事件总数', value: riskList.length, color: '#3b82f6', icon: Shield },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid #1e293b' }}>
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" style={{ color }} />
                  <span className="text-sm text-slate-300">{label}</span>
                </div>
                <span className="text-xl font-black font-mono" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card-glow p-5">
        <h2 className="section-header">风险规则引擎</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {RISK_RULES.map((rule) => {
            const severity = SEVERITY_MAP[rule.severity] ?? SEVERITY_MAP.info
            return (
              <div key={rule.id} className="rounded-lg p-3 flex items-start gap-3" style={{ background: rule.active ? 'rgba(30,41,59,0.6)' : 'rgba(15,23,42,0.4)', border: `1px solid ${rule.active ? `${severity.color}40` : '#1e293b'}` }}>
                <div className={`mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${rule.active ? 'animate-pulse' : 'opacity-30'}`} style={{ background: severity.color, boxShadow: rule.active ? `0 0 6px ${severity.color}` : 'none' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-slate-200">{rule.name}</span>
                    <span className={`badge text-xs ${severity.cls}`}>{severity.label}</span>
                  </div>
                  <p className="text-xs text-slate-500">{rule.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card-glow p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-header mb-0">风险事件列表</h2>
          <span className="text-xs text-slate-500">当前结果 {sortedRisks.length} 条</span>
        </div>
        {loading ? (
          <LoadingSpinner message="加载风险事件..." className="py-8" />
        ) : sortedRisks.length === 0 ? (
          <div className="text-center py-10">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
            <p className="text-emerald-400 font-semibold">当前筛选条件下无风险事件</p>
            <p className="text-slate-500 text-sm mt-1">可以清空筛选后重新查看全量事件</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>检测时间</th>
                  <th>事件类型</th>
                  <th>描述</th>
                  <th>资产</th>
                  <th>用户</th>
                  <th>严重程度</th>
                  <th>状态</th>
                  <th>评分</th>
                </tr>
              </thead>
              <tbody>
                {sortedRisks.map((risk, index) => {
                  const severity = SEVERITY_MAP[safeString(risk.severity, 'info')] ?? SEVERITY_MAP.info
                  const status = STATUS_MAP[safeString(risk.status, 'open')] ?? { label: safeString(risk.status), cls: 'badge-gray' }
                  return (
                    <tr key={getId(risk) || `risk-${index}`}>
                      <td className="font-mono text-xs text-slate-400">{risk.detected_at || risk.created_at ? dayjs(risk.detected_at ?? risk.created_at).format('MM-DD HH:mm:ss') : '-'}</td>
                      <td className="text-slate-200 font-medium">{EVENT_TYPE_LABELS[safeString(risk.event_type)] ?? safeString(risk.event_type, '-')}</td>
                      <td className="text-slate-400 text-xs max-w-56 truncate">{safeString(risk.description, '-')}</td>
                      <td className="text-slate-300 text-xs">{safeString(risk.asset_name, '-')}</td>
                      <td className="text-slate-300 text-xs">{safeString(risk.username, '-')}</td>
                      <td><span className={`badge ${severity.cls}`}>{severity.label}</span></td>
                      <td><span className={`badge ${status.cls}`}>{status.label}</span></td>
                      <td>
                        {risk.score != null || risk.risk_score != null ? (
                          <span className="font-mono text-sm font-bold" style={{ color: severity.color }}>
                            {safeNumber(risk.score ?? risk.risk_score).toFixed(1)}
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

      {showReport && report ? (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={(event) => event.target === event.currentTarget && setShowReport(false)}>
          <div className="card-glow w-full max-w-xl max-h-[80vh] overflow-y-auto p-6 animate-slide-in">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-400" /> 风险分析报告
              </h2>
              <button onClick={() => setShowReport(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="space-y-4">
              {report.summary ? (
                <div className="alert-info">
                  <p className="font-semibold mb-1">综合评估</p>
                  <p>{report.summary}</p>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: '综合风险评分', value: report.risk_score?.toFixed(1) ?? '-', color: '#f97316' },
                  { label: '事件总数', value: report.total_events ?? '-', color: '#3b82f6' },
                  { label: '严重事件', value: report.critical_count ?? 0, color: '#ef4444' },
                  { label: '高危事件', value: report.high_count ?? 0, color: '#f97316' },
                  { label: '中危事件', value: report.medium_count ?? 0, color: '#f59e0b' },
                  { label: '低危事件', value: report.low_count ?? 0, color: '#10b981' },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg p-3 text-center" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b' }}>
                    <p className="text-xl font-black font-mono" style={{ color: item.color }}>{item.value}</p>
                    <p className="text-xs text-slate-500">{item.label}</p>
                  </div>
                ))}
              </div>
              {toArray(report.recommendations).length > 0 ? (
                <div>
                  <p className="section-header">处置建议</p>
                  <ul className="space-y-2">
                    {toArray(report.recommendations).map((item, index) => (
                      <li key={`${item}-${index}`} className="flex items-start gap-2 text-sm text-slate-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
