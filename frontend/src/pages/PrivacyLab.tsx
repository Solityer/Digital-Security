import { useCallback, useEffect, useState, type ReactNode } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  FlaskConical, Play, Download, ChevronDown, ChevronRight, RefreshCw,
} from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import { getAssets, runGraphSDP, runGCCSDP, runGSLDP, runNDKD } from '../api/endpoints'
import { getId, safeNumber, safeString, toArray, toObject, unwrapResult } from '../api/normalizers'

type TabId = 'graph_sdp' | 'gcc_sdp' | 'gs_ldp' | 'ndkd'

interface Asset {
  id?: string
  asset_id?: string
  name: string
}

interface TaskResponse {
  result?: Record<string, unknown>
  metrics?: Record<string, unknown>
  elapsed_ms?: number
  explanation_steps?: Array<Record<string, unknown>>
}

function barOption(categories: string[], series: Array<{ name: string; data: number[]; color: string }>, title = '') {
  return {
    backgroundColor: 'transparent',
    title: title ? { text: title, textStyle: { color: '#94a3b8', fontSize: 11 }, left: 'center', top: 4 } : undefined,
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
    grid: { left: 42, right: 12, top: title ? 32 : 12, bottom: series.length > 1 ? 42 : 20 },
    xAxis: { type: 'category', data: categories, axisLabel: { color: '#64748b', fontSize: 9 }, axisLine: { lineStyle: { color: '#1e293b' } } },
    yAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 9 }, splitLine: { lineStyle: { color: '#1e293b' } } },
    series: series.map((item) => ({
      name: item.name,
      type: 'bar',
      data: item.data,
      barMaxWidth: 22,
      itemStyle: { color: item.color, borderRadius: [3, 3, 0, 0] },
    })),
  }
}

function lineOption(xData: (string | number)[], series: Array<{ name: string; data: number[]; color: string }>, title = '') {
  return {
    backgroundColor: 'transparent',
    title: title ? { text: title, textStyle: { color: '#94a3b8', fontSize: 11 }, left: 'center', top: 4 } : undefined,
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
    grid: { left: 42, right: 12, top: title ? 32 : 12, bottom: 42 },
    xAxis: { type: 'category', data: xData, axisLabel: { color: '#64748b', fontSize: 9 }, axisLine: { lineStyle: { color: '#1e293b' } } },
    yAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 9 }, splitLine: { lineStyle: { color: '#1e293b' } } },
    series: series.map((item) => ({
      name: item.name,
      type: 'line',
      data: item.data,
      smooth: true,
      lineStyle: { color: item.color, width: 2 },
      itemStyle: { color: item.color },
      areaStyle: { color: item.color, opacity: 0.12 },
    })),
  }
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function getDistributionData(value: unknown) {
  const dist = toObject<Record<string, unknown>>(value, {})
  const labels = toArray(dist.degrees).map((item) => safeString(item))
  const normalized = toArray(dist.normalized).map((item) => safeNumber(item))
  const counts = toArray(dist.counts).map((item) => safeNumber(item))
  return {
    labels,
    values: normalized.length > 0 ? normalized : counts,
  }
}

function MetricsTable({ metrics }: { metrics: Record<string, unknown> }) {
  const entries = Object.entries(metrics)
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">暂无指标数据</p>
  }
  return (
    <table className="data-table w-full">
      <thead><tr><th>指标</th><th>值</th></tr></thead>
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key}>
            <td className="text-slate-400">{key}</td>
            <td className="font-mono text-cyan-300">{typeof value === 'number' ? value.toFixed(6) : safeString(value, '-')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function JsonFallback({ title, data }: { title: string; data: unknown }) {
  return (
    <div className="rounded-lg p-4" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b' }}>
      <p className="text-xs font-semibold text-slate-400 mb-2">{title}</p>
      <pre className="max-h-80 overflow-auto rounded bg-slate-950/60 p-3 text-xs text-slate-300">{JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}

function Accordion({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800/50 transition-colors" onClick={() => setOpen((value) => !value)}>
        <span>{title}</span>
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {open ? <div className="px-4 pb-4 text-sm text-slate-400 space-y-2">{children}</div> : null}
    </div>
  )
}

function ResultMeta({ response }: { response: TaskResponse | null }) {
  if (!response) return null
  const metrics = toObject<Record<string, unknown>>(response.metrics, {})
  const steps = toArray<Record<string, unknown>>(response.explanation_steps)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '执行耗时', value: `${safeNumber(response.elapsed_ms).toFixed(1)} ms`, color: '#3b82f6' },
          { label: '指标数量', value: String(Object.keys(metrics).length), color: '#10b981' },
          { label: '步骤数量', value: String(steps.length), color: '#a78bfa' },
        ].map((item) => (
          <div key={item.label} className="rounded-lg p-3 text-center" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b' }}>
            <p className="text-lg font-black font-mono" style={{ color: item.color }}>{item.value}</p>
            <p className="text-xs text-slate-500 mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="card-glow p-4">
        <p className="section-header">评估指标</p>
        <MetricsTable metrics={metrics} />
      </div>

      <Accordion title="算法步骤说明">
        {steps.length > 0 ? (
          <ol className="list-decimal list-inside space-y-2">
            {steps.map((step, index) => (
              <li key={`${safeString(step.step, String(index))}-${index}`}>
                <span className="font-semibold text-slate-300">{safeString(step.description, `步骤 ${index + 1}`)}</span>
                <p className="text-xs text-slate-500 mt-1 leading-5">{safeString(step.detail, '无详细说明')}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-500">暂无步骤说明</p>
        )}
      </Accordion>
    </div>
  )
}

function AssetSelector({ assets, value, onChange }: { assets: Asset[]; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="form-label">选择数据资产</label>
      <select className="form-input" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">-- 请选择资产 --</option>
        {assets.map((asset) => (
          <option key={getId(asset)} value={getId(asset)}>{safeString(asset.name, '未命名资产')}</option>
        ))}
      </select>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <p className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-400">{text}</p>
}

function GraphSDPTab({ assets }: { assets: Asset[] }) {
  const [assetId, setAssetId] = useState('')
  const [epsilon, setEpsilon] = useState(1)
  const [lParam, setLParam] = useState(10)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [response, setResponse] = useState<TaskResponse | null>(null)

  const run = async () => {
    if (!assetId) {
      setError('请先选择数据资产')
      return
    }
    setError('')
    setLoading(true)
    setResponse(null)
    try {
      const data = await runGraphSDP({ asset_id: Number(assetId), epsilon, clip_threshold: lParam })
      setResponse(toObject<TaskResponse>(data, {} as TaskResponse))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '执行失败')
    } finally {
      setLoading(false)
    }
  }

  const result = unwrapResult<Record<string, unknown>>(response)
  const trueDist = getDistributionData(result.true_distribution)
  const perturbedDist = getDistributionData(result.perturbed_distribution)
  const correctedDist = getDistributionData(result.corrected_distribution)
  const labels = trueDist.labels.length > 0 ? trueDist.labels : correctedDist.labels

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="col-span-2 md:col-span-2"><AssetSelector assets={assets} value={assetId} onChange={setAssetId} /></div>
        <div>
          <label className="form-label">隐私预算 ε: {epsilon}</label>
          <input type="range" min="0.1" max="5" step="0.1" value={epsilon} onChange={(event) => setEpsilon(Number(event.target.value))} className="w-full accent-blue-500 mt-2" />
        </div>
        <div>
          <label className="form-label">截断参数 L: {lParam}</label>
          <input type="range" min="5" max="20" step="1" value={lParam} onChange={(event) => setLParam(Number(event.target.value))} className="w-full accent-cyan-500 mt-2" />
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={run} disabled={loading || !assetId} className="btn btn-primary gap-2">
          {loading ? <LoadingSpinner size="sm" /> : <Play className="w-4 h-4" />}
          {loading ? '运行中...' : '运行 Graph-SDP'}
        </button>
        {response ? (
          <button className="btn btn-secondary gap-2" onClick={() => downloadJson('graph-sdp-result.json', response)}>
            <Download className="w-4 h-4" /> 导出 JSON
          </button>
        ) : null}
      </div>

      {error ? <p className="alert-error">{error}</p> : null}
      {loading ? <LoadingSpinner message="执行差分隐私算法..." className="py-8" size="lg" /> : null}

      {!loading && response ? (
        <div className="space-y-4 animate-fade-in">
          {labels.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { title: '真实分布', values: trueDist.values, color: '#3b82f6' },
                { title: '扰动分布', values: perturbedDist.values, color: '#f59e0b' },
                { title: '校正分布', values: correctedDist.values, color: '#10b981' },
              ].map((item) => (
                <div key={item.title} className="rounded-lg p-3" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b' }}>
                  <p className="text-xs font-semibold text-slate-400 text-center mb-2">{item.title}</p>
                  <ReactECharts option={barOption(labels, [{ name: item.title, data: item.values, color: item.color }])} style={{ height: 200 }} />
                </div>
              ))}
            </div>
          ) : (
            <JsonFallback title="Graph-SDP 原始返回" data={response} />
          )}
          <ResultMeta response={response} />
        </div>
      ) : null}
    </div>
  )
}

function GCCSDPTab({ assets }: { assets: Asset[] }) {
  const [assetId, setAssetId] = useState('')
  const [epsilon, setEpsilon] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [response, setResponse] = useState<TaskResponse | null>(null)

  const run = async () => {
    if (!assetId) {
      setError('请先选择数据资产')
      return
    }
    setError('')
    setLoading(true)
    setResponse(null)
    try {
      const data = await runGCCSDP({ asset_id: Number(assetId), epsilon })
      setResponse(toObject<TaskResponse>(data, {} as TaskResponse))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '执行失败')
    } finally {
      setLoading(false)
    }
  }

  const result = unwrapResult<Record<string, unknown>>(response)
  const sampleBefore = toObject<Record<string, unknown>>(result.per_node_cc_sample, {})
  const sampleAfter = toObject<Record<string, unknown>>(result.per_node_perturbed_sample, {})
  const sampleKeys = Array.from(new Set([...Object.keys(sampleBefore), ...Object.keys(sampleAfter)])).slice(0, 10)
  const summaryValues = [
    safeNumber(result.true_global_cc),
    safeNumber(result.noisy_global_cc_laplace),
    safeNumber(result.perturbed_global_cc_subgraph),
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <AssetSelector assets={assets} value={assetId} onChange={setAssetId} />
        <div>
          <label className="form-label">隐私预算 ε: {epsilon}</label>
          <input type="range" min="0.1" max="5" step="0.1" value={epsilon} onChange={(event) => setEpsilon(Number(event.target.value))} className="w-full accent-blue-500 mt-2" />
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={run} disabled={loading || !assetId} className="btn btn-primary gap-2">
          {loading ? <LoadingSpinner size="sm" /> : <Play className="w-4 h-4" />}
          {loading ? '运行中...' : '运行 GCC-SDP'}
        </button>
        {response ? (
          <button className="btn btn-secondary gap-2" onClick={() => downloadJson('gcc-sdp-result.json', response)}>
            <Download className="w-4 h-4" /> 导出 JSON
          </button>
        ) : null}
      </div>

      {error ? <p className="alert-error">{error}</p> : null}
      {loading ? <LoadingSpinner message="计算聚类系数..." className="py-8" size="lg" /> : null}

      {!loading && response ? (
        <div className="space-y-4 animate-fade-in">
          <div className="card-glow p-4">
            <p className="section-header">全局聚类系数对比</p>
            <ReactECharts option={barOption(['真实值', 'Laplace 扰动', '子图扰动'], [{ name: '聚类系数', data: summaryValues, color: '#3b82f6' }])} style={{ height: 220 }} />
          </div>

          {sampleKeys.length > 0 ? (
            <div className="card-glow p-4">
              <p className="section-header">节点级样本对比</p>
              <ReactECharts option={lineOption(sampleKeys, [
                { name: '原始聚类系数', data: sampleKeys.map((key) => safeNumber(sampleBefore[key])), color: '#3b82f6' },
                { name: '扰动后聚类系数', data: sampleKeys.map((key) => safeNumber(sampleAfter[key])), color: '#f59e0b' },
              ])} style={{ height: 220 }} />
            </div>
          ) : (
            <JsonFallback title="GCC-SDP 原始返回" data={response} />
          )}

          <ResultMeta response={response} />
        </div>
      ) : null}
    </div>
  )
}

function GSLDPTab({ assets }: { assets: Asset[] }) {
  const [assetId, setAssetId] = useState('')
  const [epsilon, setEpsilon] = useState(1)
  const [theta, setTheta] = useState(0.2)
  const [mode, setMode] = useState<'node' | 'edge'>('node')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [response, setResponse] = useState<TaskResponse | null>(null)

  const run = async () => {
    if (!assetId) {
      setError('请先选择数据资产')
      return
    }
    setError('')
    setLoading(true)
    setResponse(null)
    try {
      const data = await runGSLDP({
        asset_id: Number(assetId),
        epsilon,
        randomize_edges: true,
        randomize_attributes: mode === 'node',
        edge_flip_prob: theta,
        attr_noise_scale: theta,
      })
      setResponse(toObject<TaskResponse>(data, {} as TaskResponse))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '执行失败')
    } finally {
      setLoading(false)
    }
  }

  const result = unwrapResult<Record<string, unknown>>(response)
  const trueDist = getDistributionData(result.true_degree_distribution)
  const noisyDist = getDistributionData(result.noisy_degree_distribution)
  const labels = trueDist.labels.length > 0 ? trueDist.labels : noisyDist.labels

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="col-span-2"><AssetSelector assets={assets} value={assetId} onChange={setAssetId} /></div>
        <div>
          <label className="form-label">隐私预算 ε: {epsilon}</label>
          <input type="range" min="0.1" max="5" step="0.1" value={epsilon} onChange={(event) => setEpsilon(Number(event.target.value))} className="w-full accent-blue-500 mt-2" />
        </div>
        <div>
          <label className="form-label">噪声强度 θ: {theta.toFixed(2)}</label>
          <input type="range" min="0.05" max="0.8" step="0.05" value={theta} onChange={(event) => setTheta(Number(event.target.value))} className="w-full accent-cyan-500 mt-2" />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <label className="form-label mb-0">模式</label>
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          {(['node', 'edge'] as const).map((item) => (
            <button key={item} type="button" onClick={() => setMode(item)} className={`px-4 py-1.5 text-sm font-medium transition-colors ${mode === item ? 'bg-blue-700 text-white' : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'}`}>
              {item === 'node' ? 'Node-LDP' : 'Edge-LDP'}
            </button>
          ))}
        </div>
        <button onClick={run} disabled={loading || !assetId} className="btn btn-primary gap-2">
          {loading ? <LoadingSpinner size="sm" /> : <Play className="w-4 h-4" />}
          {loading ? '运行中...' : '运行 GS-LDP'}
        </button>
        {response ? (
          <button className="btn btn-secondary gap-2" onClick={() => downloadJson('gs-ldp-result.json', response)}>
            <Download className="w-4 h-4" /> 导出 JSON
          </button>
        ) : null}
      </div>

      {error ? <p className="alert-error">{error}</p> : null}
      {loading ? <LoadingSpinner message="运行本地差分隐私算法..." className="py-8" size="lg" /> : null}

      {!loading && response ? (
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: '原始边数', value: String(safeNumber(result.true_edge_count)), color: '#3b82f6' },
              { label: '扰动后边数', value: String(safeNumber(result.noisy_edge_count)), color: '#10b981' },
              { label: '模式', value: mode === 'node' ? 'Node-LDP' : 'Edge-LDP', color: '#a78bfa' },
            ].map((item) => (
              <div key={item.label} className="rounded-lg p-3 text-center" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b' }}>
                <p className="text-lg font-black font-mono" style={{ color: item.color }}>{item.value}</p>
                <p className="text-xs text-slate-500 mt-1">{item.label}</p>
              </div>
            ))}
          </div>

          {labels.length > 0 ? (
            <div className="card-glow p-4">
              <p className="section-header">度分布对比</p>
              <ReactECharts option={barOption(labels, [
                { name: '原始分布', data: trueDist.values, color: '#3b82f6' },
                { name: '扰动分布', data: noisyDist.values, color: '#f59e0b' },
              ])} style={{ height: 220 }} />
            </div>
          ) : (
            <JsonFallback title="GS-LDP 原始返回" data={response} />
          )}

          <ResultMeta response={response} />
        </div>
      ) : null}
    </div>
  )
}

function NDKDTab({ assets }: { assets: Asset[] }) {
  const [assetId, setAssetId] = useState('')
  const [k, setK] = useState(3)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [response, setResponse] = useState<TaskResponse | null>(null)

  const run = async () => {
    if (!assetId) {
      setError('请先选择数据资产')
      return
    }
    setError('')
    setLoading(true)
    setResponse(null)
    try {
      const data = await runNDKD({ asset_id: Number(assetId), k })
      setResponse(toObject<TaskResponse>(data, {} as TaskResponse))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '执行失败')
    } finally {
      setLoading(false)
    }
  }

  const result = unwrapResult<Record<string, unknown>>(response)
  const metrics = toObject<Record<string, unknown>>(response?.metrics, {})
  const before = toObject<Record<string, unknown>>(result.degree_distribution_before, {})
  const after = toObject<Record<string, unknown>>(result.degree_distribution_after, {})
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort((left, right) => Number(left) - Number(right)).slice(0, 15)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <AssetSelector assets={assets} value={assetId} onChange={setAssetId} />
        <div>
          <label className="form-label">k 匿名度: {k}</label>
          <input type="range" min="2" max="10" step="1" value={k} onChange={(event) => setK(Number(event.target.value))} className="w-full accent-blue-500 mt-2" />
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={run} disabled={loading || !assetId} className="btn btn-primary gap-2">
          {loading ? <LoadingSpinner size="sm" /> : <Play className="w-4 h-4" />}
          {loading ? '运行中...' : '运行 NDKD'}
        </button>
        {response ? (
          <button className="btn btn-secondary gap-2" onClick={() => downloadJson('ndkd-result.json', response)}>
            <Download className="w-4 h-4" /> 导出 JSON
          </button>
        ) : null}
      </div>

      {error ? <p className="alert-error">{error}</p> : null}
      {loading ? <LoadingSpinner message="运行图匿名化算法..." className="py-8" size="lg" /> : null}

      {!loading && response ? (
        <div className="space-y-4 animate-fade-in">
          {keys.length > 0 ? (
            <div className="card-glow p-4">
              <p className="section-header">匿名化前后度分布对比</p>
              <ReactECharts option={barOption(keys, [
                { name: '匿名前', data: keys.map((key) => safeNumber(before[key])), color: '#3b82f6' },
                { name: '匿名后', data: keys.map((key) => safeNumber(after[key])), color: '#10b981' },
              ])} style={{ height: 220 }} />
            </div>
          ) : (
            <JsonFallback title="NDKD 原始返回" data={response} />
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'k 匿名是否满足', value: safeString(result.k_anonymity_satisfied, '-'), color: '#10b981' },
              { label: '最小分组大小', value: String(safeNumber(result.min_group_size)), color: '#3b82f6' },
              { label: '合并组数', value: String(safeNumber(result.degree_groups_merged)), color: '#a78bfa' },
              { label: '边变化比例', value: `${(safeNumber(metrics.edge_change_ratio) * 100).toFixed(1)}%`, color: '#f59e0b' },
            ].map((item) => (
              <div key={item.label} className="rounded-lg p-3 text-center" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b' }}>
                <p className="text-lg font-black font-mono" style={{ color: item.color }}>{item.value}</p>
                <p className="text-xs text-slate-500 mt-1">{item.label}</p>
              </div>
            ))}
          </div>

          <ResultMeta response={response} />
        </div>
      ) : null}
    </div>
  )
}

export default function PrivacyLab() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [assetsLoading, setAssetsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [activeTab, setActiveTab] = useState<TabId>('graph_sdp')

  const loadAssets = useCallback(async () => {
    setAssetsLoading(true)
    setLoadError('')
    try {
      const data = await getAssets()
      setAssets(toArray<Asset>(data, ['items', 'assets']))
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : '资产加载失败')
      setAssets([])
    } finally {
      setAssetsLoading(false)
    }
  }, [])

  useEffect(() => { loadAssets() }, [loadAssets])

  const tabs: { id: TabId; label: string; desc: string }[] = [
    { id: 'graph_sdp', label: 'Graph-SDP', desc: '图度序列差分隐私' },
    { id: 'gcc_sdp', label: 'GCC-SDP', desc: '聚类系数差分隐私' },
    { id: 'gs_ldp', label: 'GS-LDP', desc: '图子结构本地差分隐私' },
    { id: 'ndkd', label: 'NDKD', desc: '节点度 k-匿名化' },
  ]

  const assetList = toArray<Asset>(assets)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-tech">隐私计算实验室</h1>
          <p className="text-slate-400 text-sm mt-0.5">图差分隐私与匿名化算法验证平台</p>
        </div>
        <button onClick={loadAssets} className="btn btn-secondary gap-2" disabled={assetsLoading}>
          <RefreshCw className={`w-4 h-4 ${assetsLoading ? 'animate-spin' : ''}`} />
          刷新资产
        </button>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <div className="flex items-center justify-between gap-4">
            <span>{loadError}</span>
            <button onClick={loadAssets} className="underline underline-offset-2">重试</button>
          </div>
        </div>
      ) : null}

      <div className="flex gap-2 p-1 rounded-xl" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #1e293b' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all ${
              activeTab === tab.id
                ? 'bg-gradient-to-r from-blue-800 to-blue-700 text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <div className="font-bold">{tab.label}</div>
            <div className="text-xs opacity-70 mt-0.5 hidden sm:block">{tab.desc}</div>
          </button>
        ))}
      </div>

      <div className="card-glow p-6">
        {assetsLoading ? (
          <LoadingSpinner message="加载数据资产..." className="py-8" />
        ) : assetList.length === 0 ? (
          <EmptyState text="当前没有可用资产，请先到数据资产页生成或登记图资产。" />
        ) : (
          <>
            {activeTab === 'graph_sdp' ? <GraphSDPTab assets={assetList} /> : null}
            {activeTab === 'gcc_sdp' ? <GCCSDPTab assets={assetList} /> : null}
            {activeTab === 'gs_ldp' ? <GSLDPTab assets={assetList} /> : null}
            {activeTab === 'ndkd' ? <NDKDTab assets={assetList} /> : null}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { title: 'Graph-SDP', desc: '度分布隐私发布，展示真实/扰动/校正三种分布对比。', color: '#3b82f6' },
          { title: 'GCC-SDP', desc: '聚类系数差分隐私发布，适合演示全局统计量保护。', color: '#a78bfa' },
          { title: 'GS-LDP', desc: '本地差分隐私保护，重点展示边扰动和度分布变化。', color: '#22d3ee' },
          { title: 'NDKD', desc: 'k-度匿名化，适合展示匿名前后结构统计变化。', color: '#10b981' },
        ].map((item) => (
          <div key={item.title} className="card-glow p-4">
            <div className="flex items-center gap-2 mb-2">
              <FlaskConical className="w-4 h-4" style={{ color: item.color }} />
              <span className="font-bold text-sm" style={{ color: item.color }}>{item.title}</span>
            </div>
            <p className="text-xs text-slate-500 leading-5">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
