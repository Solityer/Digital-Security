import { useState, useEffect, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  Play, CheckCircle2, Clock, BarChart3,
  Activity, Shield, RefreshCw, ChevronRight,
} from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import StepTimeline, { Step } from '../components/StepTimeline'
import { getDemoScenarios, runDemoScenario } from '../api/endpoints'

interface ScenarioStep {
  id?: string
  name?: string
  description?: string
  status?: string
  duration_ms?: number
}

interface ScenarioMetric {
  name: string
  value: string | number
  unit?: string
  color?: string
}

interface ScenarioResult {
  scenario?: string
  status?: string
  steps?: ScenarioStep[]
  metrics?: ScenarioMetric[] | Record<string, number>
  duration_ms?: number
  message?: string
}

interface ScenarioInfo {
  id: string
  name: string
  description: string
  industry: string
  actors?: string[]
  technologies?: string[]
}

const FALLBACK_SCENARIOS: ScenarioInfo[] = [
  {
    id: 'financial_risk',
    name: '金融联合风控',
    description: '多家银行在数据不出域的前提下，利用图差分隐私技术联合分析企业贷款风险，实现跨机构欺诈识别与反洗钱分析。',
    industry: '金融',
    actors: ['银行A', '银行B', '金融监管机构', '数据平台'],
    technologies: ['Graph-SDP', 'VPCS加密查询', 'RBAC授权', '审计追踪'],
  },
  {
    id: 'medical_research',
    name: '医疗科研共享',
    description: '医院在保护患者隐私的前提下，向医疗研究机构开放匿名化后的疾病传播图数据，支持流行病学研究与药物研发。',
    industry: '医疗',
    actors: ['三甲医院', '医学研究院', '卫健委', '伦理委员会'],
    technologies: ['NDKD匿名化', 'GS-LDP', 'zkGCN推理', '合约授权'],
  },
  {
    id: 'gov_open_data',
    name: '政务数据开放',
    description: '政府部门将交通、人口等图数据经可信治理后开放给企业和研究机构使用，确保数据主权与合规流通。',
    industry: '政务',
    actors: ['政务数据中心', '交通管理局', '科研机构', '企业用户'],
    technologies: ['GCC-SDP', 'VPCS路径查询', 'ABAC授权', '区块链存证'],
  },
]

const INDUSTRY_COLORS: Record<string, string> = {
  金融: '#3b82f6',
  医疗: '#10b981',
  政务: '#a78bfa',
}

function buildSankeyOption(actors: string[]) {
  if (actors.length < 2) return {}
  const links: Array<{ source: string; target: string; value: number }> = []
  for (let i = 0; i < actors.length - 1; i++) {
    links.push({ source: actors[i], target: actors[i + 1], value: 20 + Math.random() * 30 })
  }
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item' },
    series: [{
      type: 'sankey',
      data: actors.map((a, i) => ({
        name: a,
        itemStyle: { color: `hsl(${200 + i * 30}, 70%, 50%)` },
      })),
      links,
      lineStyle: { color: 'source', opacity: 0.4 },
      label: { color: '#94a3b8', fontSize: 11 },
    }],
  }
}

function buildMetricsBar(metrics: ScenarioMetric[]) {
  const cats = metrics.map(m => m.name)
  const vals = metrics.map(m => Number(m.value))
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: 80, right: 16, top: 8, bottom: 8 },
    xAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 9 }, splitLine: { lineStyle: { color: '#1e293b' } } },
    yAxis: { type: 'category', data: cats, axisLabel: { color: '#94a3b8', fontSize: 10 } },
    series: [{
      type: 'bar',
      data: vals.map((v, i) => ({
        value: v,
        itemStyle: { color: `hsl(${200 + i * 25}, 70%, 55%)`, borderRadius: [0, 4, 4, 0] },
      })),
      label: { show: true, position: 'right', color: '#94a3b8', fontSize: 9 },
    }],
  }
}

function stepsToTimeline(steps: ScenarioStep[], running: boolean): Step[] {
  return steps.map((s, i) => ({
    id: s.id ?? `step-${i}`,
    label: s.name ?? `步骤 ${i + 1}`,
    description: s.description,
    status: running && i === steps.length - 1 ? 'running'
           : s.status === 'completed' || s.status === 'success' ? 'success'
           : s.status === 'error' || s.status === 'failed' ? 'error'
           : running ? 'pending' : 'pending',
    detail: s.duration_ms != null ? `耗时 ${s.duration_ms} ms` : undefined,
  }))
}

interface ScenarioCardProps {
  scenario: ScenarioInfo
  color: string
}

function ScenarioCard({ scenario, color }: ScenarioCardProps) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ScenarioResult | null>(null)
  const [error, setError] = useState('')

  const handleRun = async () => {
    setRunning(true)
    setError('')
    setResult(null)
    try {
      const data = await runDemoScenario(scenario.id)
      setResult(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '演示执行失败')
    } finally {
      setRunning(false)
    }
  }

  const steps: ScenarioStep[] = result?.steps ?? []
  const completedSteps = steps.filter(s => s.status === 'completed' || s.status === 'success').length
  const metrics: ScenarioMetric[] = Array.isArray(result?.metrics)
    ? (result.metrics as ScenarioMetric[])
    : Object.entries(result?.metrics ?? {}).map(([k, v]) => ({ name: k, value: v, color }))

  return (
    <div className="card-glow p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${color}20`, border: `1px solid ${color}40` }}>
            {scenario.id === 'financial_risk'  && <BarChart3 className="w-6 h-6" style={{ color }} />}
            {scenario.id === 'medical_research' && <Activity className="w-6 h-6"  style={{ color }} />}
            {scenario.id === 'gov_open_data'    && <Shield className="w-6 h-6"    style={{ color }} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-slate-100">{scenario.name}</h3>
              <span className="badge text-xs" style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>
                {scenario.industry}
              </span>
            </div>
            <p className="text-slate-400 text-sm mt-1 leading-6">{scenario.description}</p>
          </div>
        </div>
      </div>

      {/* Actors + Technologies */}
      <div className="grid grid-cols-2 gap-4">
        {scenario.actors && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">参与方</p>
            <div className="flex flex-wrap gap-1.5">
              {scenario.actors.map(a => <span key={a} className="badge badge-gray text-xs">{a}</span>)}
            </div>
          </div>
        )}
        {scenario.technologies && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">核心技术</p>
            <div className="flex flex-wrap gap-1.5">
              {scenario.technologies.map(t => (
                <span key={t} className="badge text-xs" style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>{t}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sankey flow */}
      {scenario.actors && scenario.actors.length >= 2 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">数据流向</p>
          <ReactECharts option={buildSankeyOption(scenario.actors)} style={{ height: 140 }} />
        </div>
      )}

      {/* Run button */}
      <button
        onClick={handleRun}
        disabled={running}
        className="btn w-full gap-2 justify-center text-base font-bold"
        style={{
          background: `linear-gradient(135deg, ${color}20, ${color}30)`,
          border: `1px solid ${color}50`,
          color,
        }}
      >
        {running ? <LoadingSpinner size="sm" /> : <Play className="w-5 h-5" />}
        {running ? '演示运行中...' : '开始演示'}
      </button>

      {error && <p className="alert-error">{error}</p>}

      {/* Result */}
      {(result || running) && (
        <div className="space-y-4 animate-fade-in">
          {/* Progress summary */}
          {result && (
            <div className={`rounded-lg p-3 flex items-center gap-3 ${result.status === 'completed' || result.status === 'success' ? 'alert-success' : 'alert-info'}`}>
              {result.status === 'completed' || result.status === 'success'
                ? <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                : <Clock className="w-5 h-5 flex-shrink-0" />
              }
              <div>
                <p className="font-semibold">
                  {result.status === 'completed' || result.status === 'success' ? '演示完成' : '演示进行中'}
                </p>
                {result.duration_ms != null && (
                  <p className="text-xs opacity-80">总耗时 {result.duration_ms} ms</p>
                )}
                {completedSteps > 0 && (
                  <p className="text-xs opacity-80">已完成 {completedSteps}/{steps.length} 步骤</p>
                )}
              </div>
            </div>
          )}

          {/* Steps timeline */}
          {steps.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">执行步骤</p>
              <StepTimeline
                steps={stepsToTimeline(steps, running)}
              />
            </div>
          )}

          {/* Metrics chart */}
          {metrics.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">关键指标</p>
              <ReactECharts option={buildMetricsBar(metrics)} style={{ height: 140 }} />
              <div className="mt-2 grid grid-cols-2 gap-2">
                {metrics.slice(0, 4).map(m => (
                  <div key={m.name} className="rounded-lg px-3 py-2 text-center" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b' }}>
                    <p className="text-base font-black font-mono" style={{ color: m.color ?? color }}>
                      {typeof m.value === 'number' ? m.value.toFixed(m.value < 1 ? 4 : 2) : m.value}
                      {m.unit ? ` ${m.unit}` : ''}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{m.name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result?.message && (
            <div className="alert-info">
              <p className="text-sm">{result.message}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ScenarioDemo() {
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getDemoScenarios()
      const list = data?.scenarios ?? data ?? []
      setScenarios(list.length > 0 ? list : FALLBACK_SCENARIOS)
    } catch {
      setScenarios(FALLBACK_SCENARIOS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const colorList = ['#3b82f6', '#10b981', '#a78bfa']

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-tech">行业场景演示</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            金融 · 医疗 · 政务 三大典型数据流通场景端到端演示
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn btn-secondary gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </button>
      </div>

      {/* Platform overview */}
      <div className="card-glow p-5">
        <h2 className="section-header">平台技术架构</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: '数据资产层', desc: '图谱登记 · 哈希存证 · 所有权凭证', color: '#3b82f6' },
            { label: '隐私计算层', desc: 'Graph-SDP · GCC-SDP · GS-LDP · NDKD', color: '#a78bfa' },
            { label: '流通协议层', desc: 'VPCS加密查询 · zkGCN可验证推理', color: '#22d3ee' },
            { label: '治理监控层', desc: 'RBAC/ABAC · 风险预警 · 审计追踪', color: '#10b981' },
          ].map(item => (
            <div key={item.label} className="rounded-lg p-3 flex items-start gap-2"
              style={{ background: `${item.color}12`, border: `1px solid ${item.color}30` }}>
              <ChevronRight className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: item.color }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: item.color }}>{item.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scenario cards */}
      {loading ? (
        <LoadingSpinner message="加载场景配置..." className="py-16" size="lg" />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {scenarios.map((scenario, idx) => {
            const color = INDUSTRY_COLORS[scenario.industry] ?? colorList[idx % colorList.length]
            return (
              <ScenarioCard key={scenario.id} scenario={scenario} color={color} />
            )
          })}
        </div>
      )}

      {/* Feature highlight */}
      <div className="card-glow p-5">
        <h2 className="section-header">核心创新点</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              title: '图差分隐私',
              points: [
                '业界首创图敏感度精确计算方法',
                '度序列、聚类系数差分隐私发布',
                '本地化差分隐私（LDP）支持',
                '节点度 k-匿名化算法',
              ],
              color: '#3b82f6',
              icon: BarChart3,
            },
            {
              title: '可验证加密查询',
              points: [
                '同态加密保护查询隐私',
                '加密图上的约束最短路径',
                '零知识证明验证服务器诚实',
                '虚假边混淆抵抗图形状攻击',
              ],
              color: '#22d3ee',
              icon: Shield,
            },
            {
              title: '可信治理体系',
              points: [
                '哈希链式不可篡改审计日志',
                'RBAC/ABAC 细粒度访问控制',
                '风险实时监控预警引擎',
                '区块链存证 + 可信流通凭证',
              ],
              color: '#10b981',
              icon: Activity,
            },
          ].map(item => (
            <div key={item.title} className="rounded-xl p-4"
              style={{ background: `${item.color}10`, border: `1px solid ${item.color}30` }}>
              <div className="flex items-center gap-2 mb-3">
                <item.icon className="w-5 h-5" style={{ color: item.color }} />
                <h3 className="font-bold text-base" style={{ color: item.color }}>{item.title}</h3>
              </div>
              <ul className="space-y-1.5">
                {item.points.map(p => (
                  <li key={p} className="flex items-start gap-2 text-sm text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: item.color }} />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
