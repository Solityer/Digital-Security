import { useState, useEffect, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  FlaskConical, Play, Download, ChevronDown, ChevronRight, RefreshCw,
} from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import { getAssets, runGraphSDP, runGCCSDP, runGSLDP, runNDKD } from '../api/endpoints'

type TabId = 'graph_sdp' | 'gcc_sdp' | 'gs_ldp' | 'ndkd'

interface Asset { asset_id: string; name: string }

/* ──────────── helpers ──────────── */
function barOption(categories: string[], series: Array<{ name: string; data: number[]; color: string }>, title = '') {
  return {
    backgroundColor: 'transparent',
    title: title ? { text: title, textStyle: { color: '#94a3b8', fontSize: 11 }, left: 'center', top: 4 } : undefined,
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
    grid: { left: 36, right: 12, top: title ? 32 : 12, bottom: series.length > 1 ? 40 : 12 },
    xAxis: { type: 'category', data: categories, axisLabel: { color: '#64748b', fontSize: 9 }, axisLine: { lineStyle: { color: '#1e293b' } } },
    yAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 9 }, splitLine: { lineStyle: { color: '#1e293b' } } },
    series: series.map(s => ({
      name: s.name, type: 'bar', data: s.data, barMaxWidth: 24,
      itemStyle: { color: s.color, borderRadius: [3, 3, 0, 0] },
    })),
  }
}

function lineOption(xData: (string | number)[], series: Array<{ name: string; data: number[]; color: string }>) {
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
    grid: { left: 40, right: 12, top: 16, bottom: 40 },
    xAxis: { type: 'category', data: xData, axisLabel: { color: '#64748b', fontSize: 9 }, axisLine: { lineStyle: { color: '#1e293b' } } },
    yAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 9 }, splitLine: { lineStyle: { color: '#1e293b' } } },
    series: series.map(s => ({
      name: s.name, type: 'line', data: s.data, smooth: true,
      lineStyle: { color: s.color, width: 2 },
      itemStyle: { color: s.color },
      areaStyle: { color: s.color, opacity: 0.1 },
    })),
  }
}

/* ──────────── Accordion ──────────── */
function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800/50 transition-colors" onClick={() => setOpen(o => !o)}>
        <span>{title}</span>
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {open && <div className="px-4 pb-4 text-sm text-slate-400 space-y-1">{children}</div>}
    </div>
  )
}

/* ──────────── MetricsTable ──────────── */
function MetricsTable({ metrics }: { metrics: Record<string, string | number> }) {
  return (
    <table className="data-table w-full">
      <thead><tr><th>指标</th><th>值</th></tr></thead>
      <tbody>
        {Object.entries(metrics).map(([k, v]) => (
          <tr key={k}>
            <td className="text-slate-400">{k}</td>
            <td className="font-mono text-cyan-300">{typeof v === 'number' ? v.toFixed(6) : String(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ──────────── AssetSelector ──────────── */
function AssetSelector({ assets, value, onChange }: { assets: Asset[]; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="form-label">选择数据资产</label>
      <select className="form-input" value={value} onChange={e => onChange(e.target.value)}>
        <option value="">-- 请选择资产 --</option>
        {assets.map(a => <option key={a.asset_id} value={a.asset_id}>{a.name}</option>)}
      </select>
    </div>
  )
}

/* ──────────── GraphSDP Tab ──────────── */
function GraphSDPTab({ assets }: { assets: Asset[] }) {
  const [assetId, setAssetId] = useState('')
  const [epsilon, setEpsilon] = useState(1.0)
  const [lParam, setLParam] = useState(10)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Record<string, unknown> | null>(null)

  const run = async () => {
    if (!assetId) return setError('请先选择数据资产')
    setError(''); setLoading(true); setResult(null)
    try {
      const data = await runGraphSDP({ asset_id: assetId, epsilon, l: lParam })
      setResult(data)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : '执行失败') }
    finally { setLoading(false) }
  }

  const cats = result ? Object.keys((result.true_dist as Record<string, number>) ?? {}).slice(0, 15).map(String) : []
  const trueVals = cats.map(k => ((result?.true_dist as Record<string, number>)?.[k] ?? 0))
  const pertVals = cats.map(k => ((result?.perturbed_dist as Record<string, number>)?.[k] ?? 0))
  const corrVals = cats.map(k => ((result?.corrected_dist as Record<string, number>)?.[k] ?? 0))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="col-span-2 md:col-span-2">
          <AssetSelector assets={assets} value={assetId} onChange={setAssetId} />
        </div>
        <div>
          <label className="form-label">隐私预算 ε: {epsilon}</label>
          <input type="range" min="0.1" max="5" step="0.1" value={epsilon} onChange={e => setEpsilon(Number(e.target.value))} className="w-full accent-blue-500 mt-2" />
          <div className="flex justify-between text-xs text-slate-500 mt-0.5"><span>0.1</span><span>5.0</span></div>
        </div>
        <div>
          <label className="form-label">L 参数: {lParam}</label>
          <input type="range" min="5" max="20" step="1" value={lParam} onChange={e => setLParam(Number(e.target.value))} className="w-full accent-cyan-500 mt-2" />
          <div className="flex justify-between text-xs text-slate-500 mt-0.5"><span>5</span><span>20</span></div>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={run} disabled={loading || !assetId} className="btn btn-primary gap-2">
          {loading ? <LoadingSpinner size="sm" /> : <Play className="w-4 h-4" />}
          {loading ? '运行中...' : '运行 Graph-SDP'}
        </button>
        {result && (
          <button className="btn btn-secondary gap-2"
            onClick={() => { const b = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'graph-sdp-result.json'; a.click() }}>
            <Download className="w-4 h-4" /> 导出JSON
          </button>
        )}
      </div>

      {error && <p className="alert-error">{error}</p>}
      {loading && <LoadingSpinner message="执行差分隐私算法..." className="py-8" size="lg" />}

      {result != null && !loading && (
        <div className="space-y-4 animate-fade-in">
          {/* Three bar charts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: '真实分布', vals: trueVals, color: '#3b82f6' },
              { title: '扰动分布', vals: pertVals, color: '#f59e0b' },
              { title: '校正分布', vals: corrVals, color: '#10b981' },
            ].map(({ title, vals, color }) => (
              <div key={title} className="rounded-lg p-3" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b' }}>
                <p className="text-xs font-semibold text-slate-400 text-center mb-2">{title}</p>
                <ReactECharts option={barOption(cats, [{ name: title, data: vals, color }])} style={{ height: 180 }} />
              </div>
            ))}
          </div>

          {/* Metrics */}
          {result.metrics != null && (
            <div className="card-glow p-4">
              <p className="section-header">评估指标</p>
              <MetricsTable metrics={result.metrics as Record<string, number>} />
            </div>
          )}

          {/* Steps accordion */}
          <Accordion title="算法步骤说明">
            <ol className="list-decimal list-inside space-y-1.5">
              <li>计算原始图的度序列真实分布 P_true</li>
              <li>以 Laplace 机制添加噪声（ε={epsilon}），得到扰动分布 P_pert</li>
              <li>对 P_pert 做 L1 投影校正，得到有效概率分布 P_corr</li>
              <li>用 L 参数={lParam} 截断度序列上界，防止极端节点泄露</li>
              <li>计算 L1 距离、Hellinger 距离和 MSE 评估隐私-效用权衡</li>
            </ol>
          </Accordion>
        </div>
      )}
    </div>
  )
}

/* ──────────── GCCSdp Tab ──────────── */
function GCCSDPTab({ assets }: { assets: Asset[] }) {
  const [assetId, setAssetId] = useState('')
  const [epsilon, setEpsilon] = useState(1.0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Record<string, unknown> | null>(null)

  const run = async () => {
    if (!assetId) return setError('请先选择数据资产')
    setError(''); setLoading(true); setResult(null)
    try { setResult(await runGCCSDP({ asset_id: assetId, epsilon })) }
    catch (e: unknown) { setError(e instanceof Error ? e.message : '执行失败') }
    finally { setLoading(false) }
  }

  const beforeCC: number[] = result ? ((result.before_cc as number[]) ?? []) : []
  const afterCC: number[]  = result ? ((result.after_cc  as number[]) ?? []) : []
  const xIdx = beforeCC.map((_, i) => i)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <AssetSelector assets={assets} value={assetId} onChange={setAssetId} />
        <div>
          <label className="form-label">隐私预算 ε: {epsilon}</label>
          <input type="range" min="0.1" max="5" step="0.1" value={epsilon} onChange={e => setEpsilon(Number(e.target.value))} className="w-full accent-blue-500 mt-2" />
        </div>
      </div>
      <div className="flex gap-3">
        <button onClick={run} disabled={loading || !assetId} className="btn btn-primary gap-2">
          {loading ? <LoadingSpinner size="sm" /> : <Play className="w-4 h-4" />}
          {loading ? '运行中...' : '运行 GCC-SDP'}
        </button>
        {result && (
          <button className="btn btn-secondary gap-2"
            onClick={() => { const b = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'gcc-sdp-result.json'; a.click() }}>
            <Download className="w-4 h-4" /> 导出JSON
          </button>
        )}
      </div>
      {error && <p className="alert-error">{error}</p>}
      {loading && <LoadingSpinner message="计算聚类系数..." className="py-8" size="lg" />}
      {result != null && !loading && (
        <div className="space-y-4 animate-fade-in">
          <div className="card-glow p-4">
            <p className="text-xs text-slate-400 mb-3">聚类系数对比（扰动前 vs 扰动后）</p>
            <ReactECharts option={lineOption(xIdx, [
              { name: '扰动前', data: beforeCC, color: '#3b82f6' },
              { name: '扰动后', data: afterCC,  color: '#f59e0b' },
            ])} style={{ height: 220 }} />
          </div>
          {result.metrics != null && (
            <div className="card-glow p-4">
              <p className="section-header">评估指标</p>
              <MetricsTable metrics={result.metrics as Record<string, number>} />
            </div>
          )}
          <Accordion title="GCC-SDP 算法原理">
            <p>GCC-SDP (Graph Clustering Coefficient with Sensitivity-based DP) 通过分析全局聚类系数的敏感度界限，设计最优噪声机制，在发布全局聚类系数时满足差分隐私保障，同时最小化精度损失。</p>
          </Accordion>
        </div>
      )}
    </div>
  )
}

/* ──────────── GSLDP Tab ──────────── */
function GSLDPTab({ assets }: { assets: Asset[] }) {
  const [assetId, setAssetId] = useState('')
  const [epsilon, setEpsilon] = useState(1.0)
  const [theta, setTheta] = useState(0.5)
  const [mode, setMode] = useState<'node' | 'edge'>('node')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Record<string, unknown> | null>(null)

  const run = async () => {
    if (!assetId) return setError('请先选择数据资产')
    setError(''); setLoading(true); setResult(null)
    try { setResult(await runGSLDP({ asset_id: assetId, epsilon, theta, mode })) }
    catch (e: unknown) { setError(e instanceof Error ? e.message : '执行失败') }
    finally { setLoading(false) }
  }

  const degCats = result ? Object.keys((result.degree_dist as Record<string, number>) ?? {}).slice(0, 15) : []
  const degVals = degCats.map(k => ((result?.degree_dist as Record<string, number>)?.[k] ?? 0))
  const triSeq: number[] = result ? ((result.triangle_seq as number[]) ?? []) : []

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="col-span-2">
          <AssetSelector assets={assets} value={assetId} onChange={setAssetId} />
        </div>
        <div>
          <label className="form-label">ε: {epsilon}</label>
          <input type="range" min="0.1" max="5" step="0.1" value={epsilon} onChange={e => setEpsilon(Number(e.target.value))} className="w-full accent-blue-500 mt-2" />
        </div>
        <div>
          <label className="form-label">θ 阈值: {theta}</label>
          <input type="range" min="0.1" max="1" step="0.05" value={theta} onChange={e => setTheta(Number(e.target.value))} className="w-full accent-cyan-500 mt-2" />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <label className="form-label mb-0">模式</label>
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          {(['node', 'edge'] as const).map(m => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${mode === m ? 'bg-blue-700 text-white' : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'}`}>
              {m === 'node' ? 'Node-LDP' : 'Edge-LDP'}
            </button>
          ))}
        </div>
        <button onClick={run} disabled={loading || !assetId} className="btn btn-primary gap-2">
          {loading ? <LoadingSpinner size="sm" /> : <Play className="w-4 h-4" />}
          {loading ? '运行中...' : '运行 GS-LDP'}
        </button>
        {result && (
          <button className="btn btn-secondary gap-2"
            onClick={() => { const b = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'gs-ldp-result.json'; a.click() }}>
            <Download className="w-4 h-4" /> 导出
          </button>
        )}
      </div>
      {error && <p className="alert-error">{error}</p>}
      {loading && <LoadingSpinner message="运行本地差分隐私算法..." className="py-8" size="lg" />}
      {result != null && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in">
          <div className="card-glow p-3">
            <p className="text-xs font-semibold text-slate-400 mb-2">度分布</p>
            <ReactECharts option={barOption(degCats, [{ name: '度分布', data: degVals, color: '#3b82f6' }])} style={{ height: 180 }} />
          </div>
          <div className="card-glow p-3">
            <p className="text-xs font-semibold text-slate-400 mb-2">三角形序列</p>
            <ReactECharts option={lineOption(triSeq.map((_, i) => i), [{ name: '三角形', data: triSeq, color: '#a78bfa' }])} style={{ height: 180 }} />
          </div>
          <div className="card-glow p-3">
            <p className="text-xs font-semibold text-slate-400 mb-2">聚类统计指标</p>
            {result.clustering_stats != null && <MetricsTable metrics={result.clustering_stats as Record<string, number>} />}
          </div>
        </div>
      )}
    </div>
  )
}

/* ──────────── NDKD Tab ──────────── */
function NDKDTab({ assets }: { assets: Asset[] }) {
  const [assetId, setAssetId] = useState('')
  const [k, setK] = useState(3)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Record<string, unknown> | null>(null)

  const run = async () => {
    if (!assetId) return setError('请先选择数据资产')
    setError(''); setLoading(true); setResult(null)
    try { setResult(await runNDKD({ asset_id: assetId, k })) }
    catch (e: unknown) { setError(e instanceof Error ? e.message : '执行失败') }
    finally { setLoading(false) }
  }

  const before: Record<string, number> = result ? ((result.before_degree_dist as Record<string, number>) ?? {}) : {}
  const after:  Record<string, number> = result ? ((result.after_degree_dist  as Record<string, number>) ?? {}) : {}
  const degKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort((a, b) => Number(a) - Number(b)).slice(0, 15)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <AssetSelector assets={assets} value={assetId} onChange={setAssetId} />
        <div>
          <label className="form-label">k 匿名度: {k}</label>
          <input type="range" min="2" max="10" step="1" value={k} onChange={e => setK(Number(e.target.value))} className="w-full accent-blue-500 mt-2" />
          <div className="flex justify-between text-xs text-slate-500 mt-0.5"><span>2</span><span>10</span></div>
        </div>
      </div>
      <div className="flex gap-3">
        <button onClick={run} disabled={loading || !assetId} className="btn btn-primary gap-2">
          {loading ? <LoadingSpinner size="sm" /> : <Play className="w-4 h-4" />}
          {loading ? '运行中...' : '运行 NDKD'}
        </button>
        {result && (
          <button className="btn btn-secondary gap-2"
            onClick={() => { const b = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'ndkd-result.json'; a.click() }}>
            <Download className="w-4 h-4" /> 导出
          </button>
        )}
      </div>
      {error && <p className="alert-error">{error}</p>}
      {loading && <LoadingSpinner message="运行图匿名化算法..." className="py-8" size="lg" />}
      {result != null && !loading && (
        <div className="space-y-4 animate-fade-in">
          <div className="card-glow p-4">
            <p className="text-xs text-slate-400 mb-3">匿名化前后度分布对比</p>
            <ReactECharts option={barOption(degKeys, [
              { name: '匿名前', data: degKeys.map(k => before[k] ?? 0), color: '#3b82f6' },
              { name: '匿名后', data: degKeys.map(k => after[k] ?? 0), color: '#10b981' },
            ])} style={{ height: 220 }} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {result.metrics != null && (
              <div className="card-glow p-4">
                <p className="section-header">匿名性指标</p>
                <MetricsTable metrics={result.metrics as Record<string, number>} />
              </div>
            )}
            {result.edge_change_ratio != null && (
              <div className="card-glow p-4 flex flex-col items-center justify-center">
                <p className="text-xs text-slate-400 mb-3">边变化比例</p>
                <ReactECharts option={{
                  backgroundColor: 'transparent',
                  series: [{
                    type: 'pie',
                    radius: ['50%', '75%'],
                    data: [
                      { value: Number(result.edge_change_ratio) * 100, name: '变化边', itemStyle: { color: '#f59e0b' } },
                      { value: (1 - Number(result.edge_change_ratio)) * 100, name: '原始边', itemStyle: { color: '#3b82f6' } },
                    ],
                    label: { color: '#94a3b8', fontSize: 10 },
                  }],
                  tooltip: { formatter: '{b}: {d}%' },
                }} style={{ height: 160 }} />
                <p className="text-2xl font-black text-amber-400">{(Number(result.edge_change_ratio) * 100).toFixed(1)}%</p>
                <p className="text-xs text-slate-500">边修改率</p>
              </div>
            )}
          </div>
          <Accordion title="NDKD 算法原理">
            <p>NDKD (Node Degree k-anonymization with Degree sequence) 通过修改图的度序列使其满足 k-匿名条件，即每个节点的度与至少 k-1 个其他节点相同，从而防止通过度信息识别特定节点。当前 k={k}。</p>
          </Accordion>
        </div>
      )}
    </div>
  )
}

/* ──────────── Main Page ──────────── */
export default function PrivacyLab() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [assetsLoading, setAssetsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('graph_sdp')

  const loadAssets = useCallback(async () => {
    setAssetsLoading(true)
    try {
      const data = await getAssets()
      setAssets((data?.assets ?? data ?? []) as Asset[])
    } catch { setAssets([]) }
    finally { setAssetsLoading(false) }
  }, [])

  useEffect(() => { loadAssets() }, [loadAssets])

  const tabs: { id: TabId; label: string; desc: string }[] = [
    { id: 'graph_sdp', label: 'Graph-SDP', desc: '图度序列差分隐私' },
    { id: 'gcc_sdp',   label: 'GCC-SDP',   desc: '聚类系数差分隐私' },
    { id: 'gs_ldp',    label: 'GS-LDP',    desc: '图子结构本地差分隐私' },
    { id: 'ndkd',      label: 'NDKD',      desc: '节点度 k-匿名化' },
  ]

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

      {/* Tab bar */}
      <div className="flex gap-2 p-1 rounded-xl" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #1e293b' }}>
        {tabs.map(tab => (
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

      {/* Tab content */}
      <div className="card-glow p-6">
        {assetsLoading ? (
          <LoadingSpinner message="加载数据资产..." className="py-8" />
        ) : (
          <>
            {activeTab === 'graph_sdp' && <GraphSDPTab assets={assets} />}
            {activeTab === 'gcc_sdp'   && <GCCSDPTab   assets={assets} />}
            {activeTab === 'gs_ldp'    && <GSLDPTab    assets={assets} />}
            {activeTab === 'ndkd'      && <NDKDTab      assets={assets} />}
          </>
        )}
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { title: 'Graph-SDP', desc: '基于敏感度分析的全局度序列发布，Laplace 噪声 + L1 投影校正', color: '#3b82f6' },
          { title: 'GCC-SDP',   desc: '针对全局聚类系数的差分隐私发布，精确计算敏感度上界', color: '#a78bfa' },
          { title: 'GS-LDP',    desc: '支持 Node/Edge 本地差分隐私，联合保护度序列与三角形分布', color: '#22d3ee' },
          { title: 'NDKD',      desc: '节点度 k-匿名化，通过最小化边修改满足 k-度序列匿名条件', color: '#10b981' },
        ].map(item => (
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
