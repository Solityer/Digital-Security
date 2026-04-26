import { useState, useEffect, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  AlertTriangle, Shield, RefreshCw, Play, FileText,
  CheckCircle2, X, TrendingUp,
} from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import { getRisks, evaluateRisk, getRiskReport } from '../api/endpoints'
import dayjs from 'dayjs'

interface RiskEvent {
  risk_id?: string
  event_type?: string
  description?: string
  severity?: string
  status?: string
  detected_at?: string
  asset_id?: string
  score?: number
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
  critical: { label: '严重', cls: 'badge-red',    color: '#ef4444', order: 0 },
  high:     { label: '高危', cls: 'badge-orange',  color: '#f97316', order: 1 },
  medium:   { label: '中危', cls: 'badge-yellow',  color: '#f59e0b', order: 2 },
  low:      { label: '低危', cls: 'badge-green',   color: '#10b981', order: 3 },
  info:     { label: '提示', cls: 'badge-blue',    color: '#3b82f6', order: 4 },
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  open:        { label: '待处理', cls: 'badge-red' },
  investigating: { label: '调查中', cls: 'badge-yellow' },
  resolved:    { label: '已解决', cls: 'badge-green' },
  false_positive: { label: '误报', cls: 'badge-gray' },
}

const RISK_RULES = [
  { id: 'r001', name: '高频敏感查询', desc: '单用户10分钟内查询敏感字段超过50次', active: true, severity: 'high' },
  { id: 'r002', name: '越权访问检测', desc: '用户访问超出合约授权范围的数据字段', active: true, severity: 'critical' },
  { id: 'r003', name: '隐私预算超限', desc: '单合约累计隐私预算消耗超过设定上限', active: true, severity: 'high' },
  { id: 'r004', name: '异常时间段访问', desc: '非工作时间（22:00-06:00）的数据访问', active: true, severity: 'medium' },
  { id: 'r005', name: '大批量数据导出', desc: '单次导出记录数超过10000条', active: false, severity: 'medium' },
  { id: 'r006', name: '证明验证失败', desc: 'VPCS/zkGCN证明验证连续3次失败', active: true, severity: 'critical' },
]

function buildGaugeOption(score: number) {
  const color = score >= 80 ? '#ef4444' : score >= 60 ? '#f97316' : score >= 40 ? '#f59e0b' : '#10b981'
  return {
    backgroundColor: 'transparent',
    series: [{
      type: 'gauge',
      startAngle: 210, endAngle: -30,
      min: 0, max: 100,
      radius: '90%',
      pointer: { length: '60%', width: 4, itemStyle: { color } },
      axisLine: {
        lineStyle: {
          width: 18,
          color: [[0.4, '#10b981'], [0.6, '#f59e0b'], [0.8, '#f97316'], [1, '#ef4444']],
        },
      },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { color: '#64748b', fontSize: 9 },
      detail: {
        formatter: (v: number) => `${v.toFixed(0)}`,
        color, fontSize: 28, fontWeight: 'bold', offsetCenter: [0, '30%'],
      },
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
      data: trendData.map(d => d.date),
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
      data: trendData.map(d => d.score),
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
  const [evalLoading, setEvalLoading] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [riskScore, setRiskScore] = useState(42)
  const [report, setReport] = useState<RiskReport | null>(null)
  const [showReport, setShowReport] = useState(false)
  const [trendData, setTrendData] = useState<{ date: string; score: number }[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getRisks()
      const riskList: RiskEvent[] = data?.risks ?? data ?? []
      setRisks(riskList)
      // Compute score from events
      if (riskList.length > 0) {
        const weights: Record<string, number> = { critical: 25, high: 15, medium: 8, low: 3, info: 1 }
        const raw = riskList.reduce((s, r) => s + (weights[r.severity ?? 'info'] ?? 1), 0)
        setRiskScore(Math.min(100, raw))
      }
      if (data?.risk_score != null) setRiskScore(data.risk_score)
      if (data?.trend) setTrendData(data.trend)
      else {
        // Generate mock trend
        const now = dayjs()
        setTrendData(Array.from({ length: 7 }, (_, i) => ({
          date: now.subtract(6 - i, 'day').format('MM-DD'),
          score: Math.round(30 + Math.random() * 40),
        })))
      }
    } catch { setRisks([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleEvaluate = async () => {
    setEvalLoading(true)
    try {
      const data = await evaluateRisk({})
      if (data?.risk_score != null) setRiskScore(data.risk_score)
      if (data?.risks) setRisks(data.risks)
    } catch {}
    finally { setEvalLoading(false) }
  }

  const handleReport = async () => {
    setReportLoading(true)
    try {
      const data = await getRiskReport()
      setReport(data)
      setShowReport(true)
    } catch {}
    finally { setReportLoading(false) }
  }

  const sortedRisks = [...risks].sort((a, b) =>
    (SEVERITY_MAP[a.severity ?? 'info']?.order ?? 99) - (SEVERITY_MAP[b.severity ?? 'info']?.order ?? 99)
  )

  const openCount = risks.filter(r => r.status === 'open').length
  const criticalCount = risks.filter(r => r.severity === 'critical').length
  const highCount = risks.filter(r => r.severity === 'high').length

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-tech">风险监控预警</h1>
          <p className="text-slate-400 text-sm mt-0.5">实时监控数据流通安全风险，自动检测异常访问行为</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="btn btn-secondary gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button onClick={handleEvaluate} disabled={evalLoading} className="btn btn-primary gap-2">
            {evalLoading ? <LoadingSpinner size="sm" /> : <Play className="w-4 h-4" />}
            {evalLoading ? '评估中...' : '风险评估'}
          </button>
          <button onClick={handleReport} disabled={reportLoading} className="btn btn-cyan gap-2">
            {reportLoading ? <LoadingSpinner size="sm" /> : <FileText className="w-4 h-4" />}
            {reportLoading ? '生成中...' : '生成报告'}
          </button>
        </div>
      </div>

      {/* Top row: Gauge + Trend + Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Gauge */}
        <div className="card-glow p-5 flex flex-col items-center">
          <h3 className="section-header">当前风险评分</h3>
          {loading ? <LoadingSpinner className="py-8" /> : (
            <>
              <ReactECharts option={buildGaugeOption(riskScore)} style={{ height: 200, width: '100%' }} />
              <div className="flex gap-4 mt-2">
                <span className={`badge text-sm ${riskScore >= 80 ? 'badge-red' : riskScore >= 60 ? 'badge-orange' : riskScore >= 40 ? 'badge-yellow' : 'badge-green'}`}>
                  {riskScore >= 80 ? '严重威胁' : riskScore >= 60 ? '高风险' : riskScore >= 40 ? '中风险' : '低风险'}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Trend */}
        <div className="card-glow p-5">
          <h3 className="section-header">7日风险趋势</h3>
          {trendData.length > 0 ? (
            <ReactECharts option={buildTrendOption(trendData)} style={{ height: 200 }} />
          ) : <LoadingSpinner className="py-8" />}
        </div>

        {/* Summary */}
        <div className="card-glow p-5">
          <h3 className="section-header">风险摘要</h3>
          <div className="space-y-3">
            {[
              { label: '待处理事件', value: openCount, color: '#ef4444', icon: AlertTriangle },
              { label: '严重事件', value: criticalCount, color: '#f97316', icon: AlertTriangle },
              { label: '高危事件', value: highCount, color: '#f59e0b', icon: TrendingUp },
              { label: '事件总数', value: risks.length, color: '#3b82f6', icon: Shield },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className="flex items-center justify-between rounded-lg px-3 py-2"
                style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid #1e293b' }}>
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

      {/* Risk rules */}
      <div className="card-glow p-5">
        <h2 className="section-header">风险规则引擎</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {RISK_RULES.map(rule => {
            const sev = SEVERITY_MAP[rule.severity] ?? SEVERITY_MAP.info
            return (
              <div key={rule.id}
                className="rounded-lg p-3 flex items-start gap-3"
                style={{
                  background: rule.active ? 'rgba(30,41,59,0.6)' : 'rgba(15,23,42,0.4)',
                  border: `1px solid ${rule.active ? sev.color + '40' : '#1e293b'}`,
                }}>
                <div className={`mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${rule.active ? 'animate-pulse' : 'opacity-30'}`}
                  style={{ background: sev.color, boxShadow: rule.active ? `0 0 6px ${sev.color}` : 'none' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-slate-200">{rule.name}</span>
                    <span className={`badge text-xs ${sev.cls}`}>{sev.label}</span>
                    {!rule.active && <span className="badge badge-gray text-xs">已禁用</span>}
                  </div>
                  <p className="text-xs text-slate-500">{rule.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Risk events table */}
      <div className="card-glow p-5">
        <h2 className="section-header">风险事件列表</h2>
        {loading ? (
          <LoadingSpinner message="加载风险事件..." className="py-8" />
        ) : sortedRisks.length === 0 ? (
          <div className="text-center py-10">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
            <p className="text-emerald-400 font-semibold">当前无风险事件</p>
            <p className="text-slate-500 text-sm mt-1">系统运行正常，所有监控规则均未触发</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>检测时间</th>
                  <th>事件类型</th>
                  <th>描述</th>
                  <th>严重程度</th>
                  <th>状态</th>
                  <th>评分</th>
                </tr>
              </thead>
              <tbody>
                {sortedRisks.map((risk, i) => {
                  const sev = SEVERITY_MAP[risk.severity ?? 'info'] ?? SEVERITY_MAP.info
                  const st  = STATUS_MAP[risk.status ?? 'open'] ?? { label: risk.status, cls: 'badge-gray' }
                  return (
                    <tr key={risk.risk_id ?? i}>
                      <td className="font-mono text-xs text-slate-400">
                        {risk.detected_at ? dayjs(risk.detected_at).format('MM-DD HH:mm:ss') : '-'}
                      </td>
                      <td className="text-slate-200 font-medium">{risk.event_type ?? '-'}</td>
                      <td className="text-slate-400 text-xs max-w-48 truncate">{risk.description ?? '-'}</td>
                      <td><span className={`badge ${sev.cls}`}>{sev.label}</span></td>
                      <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                      <td>
                        {risk.score != null && (
                          <span className="font-mono text-sm font-bold" style={{ color: sev.color }}>
                            {risk.score.toFixed(1)}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Report modal */}
      {showReport && report && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowReport(false)}>
          <div className="card-glow w-full max-w-xl max-h-[80vh] overflow-y-auto p-6 animate-slide-in">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-400" /> 风险分析报告
              </h2>
              <button onClick={() => setShowReport(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <div className="space-y-4">
              {report.summary && (
                <div className="alert-info">
                  <p className="font-semibold mb-1">综合评估</p>
                  <p>{report.summary}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: '综合风险评分', value: report.risk_score?.toFixed(1) ?? '-', color: '#f97316' },
                  { label: '事件总数', value: report.total_events ?? '-', color: '#3b82f6' },
                  { label: '严重事件', value: report.critical_count ?? 0, color: '#ef4444' },
                  { label: '高危事件', value: report.high_count ?? 0, color: '#f97316' },
                  { label: '中危事件', value: report.medium_count ?? 0, color: '#f59e0b' },
                  { label: '低危事件', value: report.low_count ?? 0, color: '#10b981' },
                ].map(m => (
                  <div key={m.label} className="rounded-lg p-3 text-center" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b' }}>
                    <p className="text-xl font-black font-mono" style={{ color: m.color }}>{m.value}</p>
                    <p className="text-xs text-slate-500">{m.label}</p>
                  </div>
                ))}
              </div>
              {report.recommendations && report.recommendations.length > 0 && (
                <div>
                  <p className="section-header">安全建议</p>
                  <ul className="space-y-2">
                    {report.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
