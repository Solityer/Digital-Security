import { useCallback, useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  Play, CheckCircle2, Clock, BarChart3,
  Activity, Shield, RefreshCw, ChevronRight,
} from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import StepTimeline, { type Step } from '../components/StepTimeline'
import { getDemoScenarios, runDemoScenario } from '../api/endpoints'
import { getId, safeNumber, safeString, toArray, toObject } from '../api/normalizers'

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
  metrics?: ScenarioMetric[] | Record<string, number | string>
  modules_used?: string[]
  assets?: string[]
  value_summary?: string
  results?: Record<string, unknown>
  duration_ms?: number
  message?: string
}

interface ScenarioInfo {
  id?: string
  scenario_id?: string
  name?: string
  title?: string
  description: string
  industry: string
  actors?: string[]
  assets?: string[]
  capabilities?: string[]
  technologies?: string[]
  steps?: string[]
  value?: string
}

const FALLBACK_SCENARIOS: ScenarioInfo[] = [
  {
    id: 'finance',
    name: '金融联合风控',
    description: '多家金融机构在数据不出域的前提下，联合完成风控分析、路径验证和风险评估。',
    industry: '金融',
    actors: ['银行A', '银行B', '监管机构', '平台'],
    assets: ['金融交易关系图谱', '企业风控关联图谱'],
    capabilities: ['数据资产治理', 'VPCS 可验证查询', 'GS-LDP 隐私保护', '风险联动预警'],
    technologies: ['Graph-SDP', 'VPCS', 'RBAC/ABAC', '审计追踪'],
    steps: ['准备金融资产', '执行 VPCS 路径验证', '运行 GS-LDP', '输出风险评估'],
    value: '适用于贷前反欺诈、异常资金链排查和联合风控答辩展示。',
  },
  {
    id: 'medical',
    name: '医疗科研共享',
    description: '医院与研究机构在隐私保护前提下完成图匿名化、统计发布与科研分析。',
    industry: '医疗',
    actors: ['三甲医院', '研究机构', '卫健委', '平台'],
    assets: ['医疗协同诊疗网络'],
    capabilities: ['合约授权', 'NDKD 匿名化', 'GCC-SDP 统计发布', '审计追踪'],
    technologies: ['NDKD', 'GCC-SDP', '合约授权', '审计追踪'],
    steps: ['准备医疗资产', '执行 NDKD', '运行 GCC-SDP', '输出隐私报告'],
    value: '适用于科研共享、病例联动分析和医疗数据合规开放说明。',
  },
  {
    id: 'government',
    name: '政务数据开放',
    description: '政务数据在确权、合约和可验证推理的保障下完成开放流通与审计。',
    industry: '政务',
    actors: ['政务中心', '企业', '审计方', '平台'],
    assets: ['政务开放数据关联图', '城市交通出行网络'],
    capabilities: ['确权存证', '共享授权', 'zkGCN 可验证推理', '审计链校验'],
    technologies: ['zkGCN', 'VPCS', '合约管理', '哈希链审计'],
    steps: ['准备政务资产', '创建共享合约', '运行 zkGCN', '验证审计链'],
    value: '适用于政务目录开放、公共服务协同和可验证智能分析展示。',
  },
]

const INDUSTRY_COLORS: Record<string, string> = {
  金融: '#3b82f6',
  医疗: '#10b981',
  政务: '#a78bfa',
}

function buildSankeyOption(actors: string[]) {
  if (actors.length < 2) return {}
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item' },
    series: [{
      type: 'sankey',
      data: actors.map((actor, index) => ({ name: actor, itemStyle: { color: `hsl(${200 + index * 30}, 70%, 50%)` } })),
      links: actors.slice(0, -1).map((actor, index) => ({ source: actor, target: actors[index + 1], value: 20 + index * 10 })),
      lineStyle: { color: 'source', opacity: 0.4 },
      label: { color: '#94a3b8', fontSize: 11 },
    }],
  }
}

function buildMetricsBar(metrics: ScenarioMetric[]) {
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: 80, right: 16, top: 8, bottom: 8 },
    xAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 9 }, splitLine: { lineStyle: { color: '#1e293b' } } },
    yAxis: { type: 'category', data: metrics.map((metric) => metric.name), axisLabel: { color: '#94a3b8', fontSize: 10 } },
    series: [{
      type: 'bar',
      data: metrics.map((metric, index) => ({
        value: safeNumber(metric.value),
        itemStyle: { color: metric.color ?? `hsl(${200 + index * 25}, 70%, 55%)`, borderRadius: [0, 4, 4, 0] },
      })),
      label: { show: true, position: 'right', color: '#94a3b8', fontSize: 9 },
    }],
  }
}

function toTimeline(steps: ScenarioStep[]): Step[] {
  return steps.map((step, index) => ({
    id: step.id ?? `scenario-step-${index}`,
    label: safeString(step.name, `步骤 ${index + 1}`),
    description: safeString(step.description, ''),
    status: step.status === 'completed' || step.status === 'success'
      ? 'success'
      : step.status === 'error' || step.status === 'failed'
        ? 'error'
        : 'pending',
    detail: step.duration_ms != null ? `耗时 ${step.duration_ms} ms` : undefined,
  }))
}

function normalizeMetrics(value: ScenarioResult['metrics'], color: string): ScenarioMetric[] {
  if (Array.isArray(value)) {
    return value.map((metric) => ({ ...metric, color: metric.color ?? color }))
  }
  return Object.entries(toObject<Record<string, number | string>>(value, {})).map(([key, metricValue]) => ({
    name: key,
    value: metricValue,
    color,
  }))
}

function ScenarioCard({ scenario, color }: { scenario: ScenarioInfo; color: string }) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ScenarioResult | null>(null)
  const [error, setError] = useState('')

  const handleRun = async () => {
    setRunning(true)
    setError('')
    setResult(null)
    try {
      const scenarioId = getId(scenario) || safeString(scenario.id)
      const data = await runDemoScenario(scenarioId)
      setResult(toObject<ScenarioResult>(data, {} as ScenarioResult))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '演示执行失败')
    } finally {
      setRunning(false)
    }
  }

  const steps = toArray<ScenarioStep>(result?.steps).length > 0
    ? toArray<ScenarioStep>(result?.steps)
    : toArray(scenario.steps).map((step, index) => ({ id: `preset-${index}`, name: safeString(step), status: 'pending' }))
  const metrics = normalizeMetrics(result?.metrics, color)
  const completedSteps = steps.filter((step) => step.status === 'completed' || step.status === 'success').length
  const title = safeString(scenario.name ?? scenario.title, '未命名场景')

  return (
    <div className="card-glow p-6 flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}20`, border: `1px solid ${color}40` }}>
            {safeString(scenario.industry) === '金融' ? <BarChart3 className="w-6 h-6" style={{ color }} /> : null}
            {safeString(scenario.industry) === '医疗' ? <Activity className="w-6 h-6" style={{ color }} /> : null}
            {safeString(scenario.industry) === '政务' ? <Shield className="w-6 h-6" style={{ color }} /> : null}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-slate-100">{title}</h3>
              <span className="badge text-xs" style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>{safeString(scenario.industry, '-')}</span>
            </div>
            <p className="text-slate-400 text-sm mt-1 leading-6">{safeString(scenario.description, '-')}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">参与方</p>
          <div className="flex flex-wrap gap-1.5">
            {toArray(scenario.actors).map((actor) => <span key={actor} className="badge badge-gray text-xs">{actor}</span>)}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">核心技术</p>
          <div className="flex flex-wrap gap-1.5">
            {toArray(scenario.technologies).map((technology) => <span key={technology} className="badge text-xs" style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>{technology}</span>)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">使用资产</p>
          <div className="flex flex-wrap gap-1.5">
            {toArray(scenario.assets).map((asset) => <span key={asset} className="badge badge-blue text-xs">{asset}</span>)}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">关键能力</p>
          <div className="flex flex-wrap gap-1.5">
            {toArray(scenario.capabilities).map((capability) => <span key={capability} className="badge badge-cyan text-xs">{capability}</span>)}
          </div>
        </div>
      </div>

      {toArray(scenario.actors).length >= 2 ? (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">数据流向</p>
          <ReactECharts option={buildSankeyOption(toArray(scenario.actors))} style={{ height: 140 }} />
        </div>
      ) : null}

      <button
        onClick={handleRun}
        disabled={running}
        className="btn w-full gap-2 justify-center text-base font-bold"
        style={{ background: `linear-gradient(135deg, ${color}20, ${color}30)`, border: `1px solid ${color}50`, color }}
      >
        {running ? <LoadingSpinner size="sm" /> : <Play className="w-5 h-5" />}
        {running ? '场景运行中...' : '一键运行'}
      </button>

      {error ? <p className="alert-error">{error}</p> : null}

      {(result || running) ? (
        <div className="space-y-4 animate-fade-in">
          {result ? (
            <div className={`rounded-lg p-3 flex items-center gap-3 ${result.status === 'completed' || result.status === 'success' ? 'alert-success' : 'alert-info'}`}>
              {result.status === 'completed' || result.status === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" /> : <Clock className="w-5 h-5 flex-shrink-0" />}
              <div>
                <p className="font-semibold">{result.status === 'completed' || result.status === 'success' ? '场景执行完成' : '场景执行中'}</p>
                {result.duration_ms != null ? <p className="text-xs opacity-80">总耗时 {safeNumber(result.duration_ms).toFixed(1)} ms</p> : null}
                <p className="text-xs opacity-80">已完成 {completedSteps}/{steps.length} 步骤</p>
              </div>
            </div>
          ) : null}

          {toArray(result?.modules_used).length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">本次调用模块</p>
              <div className="flex flex-wrap gap-1.5">
                {toArray(result?.modules_used).map((item) => <span key={item} className="badge badge-purple text-xs">{item}</span>)}
              </div>
            </div>
          ) : null}

          {steps.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">执行步骤</p>
              <StepTimeline steps={toTimeline(steps)} />
            </div>
          ) : null}

          {metrics.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">关键指标</p>
              <ReactECharts option={buildMetricsBar(metrics)} style={{ height: 150 }} />
              <div className="mt-2 grid grid-cols-2 gap-2">
                {metrics.slice(0, 4).map((metric) => (
                  <div key={metric.name} className="rounded-lg px-3 py-2 text-center" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b' }}>
                    <p className="text-base font-black font-mono" style={{ color: metric.color ?? color }}>
                      {typeof metric.value === 'number' ? metric.value.toFixed(metric.value < 1 ? 4 : 2) : metric.value}
                      {metric.unit ? ` ${metric.unit}` : ''}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{metric.name}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {result?.value_summary ? <div className="alert-info"><p className="text-sm">价值说明：{result.value_summary}</p></div> : null}
          {result?.message ? <div className="alert-info"><p className="text-sm">{result.message}</p></div> : null}
        </div>
      ) : null}

      {scenario.value ? <div className="alert-info"><p className="text-sm">场景价值：{scenario.value}</p></div> : null}
    </div>
  )
}

export default function ScenarioDemo() {
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const data = await getDemoScenarios()
      const list = toArray<ScenarioInfo>(data, ['items', 'scenarios'])
      setScenarios(list.length > 0 ? list : FALLBACK_SCENARIOS)
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : '场景列表加载失败')
      setScenarios(FALLBACK_SCENARIOS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const scenarioList = toArray<ScenarioInfo>(scenarios)
  const colorList = ['#3b82f6', '#10b981', '#a78bfa']

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-tech">行业场景演示</h1>
          <p className="text-slate-400 text-sm mt-0.5">金融、医疗、政务三大典型数据流通场景端到端演示</p>
        </div>
        <button onClick={load} disabled={loading} className="btn btn-secondary gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </button>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          场景接口加载失败，页面已回退到内置演示配置。错误信息：{loadError}
        </div>
      ) : null}

      <div className="card-glow p-5">
        <h2 className="section-header">平台技术架构</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: '数据资产层', desc: '图谱登记、快照、确权存证', color: '#3b82f6' },
            { label: '隐私计算层', desc: 'Graph-SDP、GCC-SDP、GS-LDP、NDKD', color: '#a78bfa' },
            { label: '协议验证层', desc: 'VPCS 查询、zkGCN 证明', color: '#22d3ee' },
            { label: '治理监控层', desc: '授权、风险、审计、场景编排', color: '#10b981' },
          ].map((item) => (
            <div key={item.label} className="rounded-lg p-3 flex items-start gap-2" style={{ background: `${item.color}12`, border: `1px solid ${item.color}30` }}>
              <ChevronRight className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: item.color }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: item.color }}>{item.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingSpinner message="加载场景配置..." className="py-16" size="lg" />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {scenarioList.map((scenario, index) => {
            const color = INDUSTRY_COLORS[safeString(scenario.industry)] ?? colorList[index % colorList.length]
            return <ScenarioCard key={getId(scenario) || safeString(scenario.id, `scenario-${index}`)} scenario={scenario} color={color} />
          })}
        </div>
      )}

      <div className="card-glow p-5">
        <h2 className="section-header">核心创新点</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              title: '图差分隐私',
              points: ['图度分布与聚类系数保护', '支持本地差分隐私采集', '支持 k-匿名化'],
              color: '#3b82f6',
              icon: BarChart3,
            },
            {
              title: '可验证加密查询',
              points: ['路径查询结果可验证', '篡改演示可直接展示', '支持加密摘要与 proof hash'],
              color: '#22d3ee',
              icon: Shield,
            },
            {
              title: '可信治理体系',
              points: ['哈希链审计', '风险预警与授权评估', '比赛前可快速诊断接口状态'],
              color: '#10b981',
              icon: Activity,
            },
          ].map((item) => (
            <div key={item.title} className="rounded-xl p-4" style={{ background: `${item.color}10`, border: `1px solid ${item.color}30` }}>
              <div className="flex items-center gap-2 mb-3">
                <item.icon className="w-5 h-5" style={{ color: item.color }} />
                <h3 className="font-bold text-base" style={{ color: item.color }}>{item.title}</h3>
              </div>
              <ul className="space-y-1.5">
                {item.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: item.color }} />
                    {point}
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
