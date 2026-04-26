import { useState, useEffect, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  Brain, CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  Layers,
} from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import { getAssets, runZKGCN, runZKGCNTamper } from '../api/endpoints'

interface Asset { asset_id: string; name: string }

interface ZKGCNResult {
  predicted_class?: number
  class_name?: string
  probabilities?: number[]
  class_names?: string[]
  graph?: {
    nodes?: Array<{ id: string; label?: string; features?: number[] }>
    edges?: Array<{ source: string; target: string }>
    adjacency_matrix?: number[][]
  }
  proof?: {
    pk_hash?: string
    vk_hash?: string
    witness_hash?: string
    public_input?: string
    proof_hash?: string
    verify_result?: boolean
  }
  r1cs_constraints?: Array<{
    layer: string
    operation: string
    constraints: number
    hash: string
  }>
  timing?: { prove_ms?: number; verify_ms?: number; total_ms?: number }
  proof_size_kb?: number
  model_layers?: Array<{ name: string; in_dim?: number; out_dim?: number }>
}

function buildAdjHeatmap(matrix: number[][]) {
  const n = Math.min(matrix.length, 20)
  const data: [number, number, number][] = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      data.push([j, i, matrix[i]?.[j] ?? 0])
    }
  }
  return {
    backgroundColor: 'transparent',
    tooltip: { show: false },
    grid: { left: 24, right: 12, top: 12, bottom: 24 },
    xAxis: { type: 'category', data: Array.from({ length: n }, (_, i) => `v${i + 1}`), axisLabel: { color: '#475569', fontSize: 8 }, axisLine: { lineStyle: { color: '#1e293b' } } },
    yAxis: { type: 'category', data: Array.from({ length: n }, (_, i) => `v${i + 1}`), axisLabel: { color: '#475569', fontSize: 8 }, axisLine: { lineStyle: { color: '#1e293b' } } },
    visualMap: { min: 0, max: 1, show: false, inRange: { color: ['#0a0e1a', '#1e40af', '#3b82f6', '#60a5fa', '#bfdbfe'] } },
    series: [{ type: 'heatmap', data, itemStyle: { borderWidth: 1, borderColor: '#0a0e1a' } }],
  }
}

function buildGraphOption(
  nodes: Array<{ id: string; label?: string; features?: number[] }>,
  edges: Array<{ source: string; target: string }>,
  predClass: number
) {
  const n = nodes ?? []
  const e = edges ?? []
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#a78bfa', '#f87171', '#22d3ee']
  return {
    backgroundColor: 'transparent',
    tooltip: { show: true, formatter: (p: { name?: string }) => p.name ?? '' },
    series: [{
      type: 'graph',
      layout: 'force',
      data: n.map((node, _i) => ({
        id: String(node.id),
        name: node.label ?? String(node.id),
        symbolSize: 28,
        itemStyle: { color: colors[predClass % colors.length], opacity: 0.85 },
        label: { show: n.length < 30, color: '#e2e8f0', fontSize: 9 },
      })),
      links: e.map((edge: { source: string; target: string }) => ({
        source: String(edge.source),
        target: String(edge.target),
        lineStyle: { color: 'rgba(59,130,246,0.35)', width: 1.5 },
      })),
      roam: true,
      force: { repulsion: 80, edgeLength: 60 },
      emphasis: { focus: 'adjacency' },
    }],
  }
}

function buildProbBar(probs: number[], names: string[]) {
  const sorted = probs.map((p, i) => ({ p, name: names[i] ?? `类${i}` })).sort((a, b) => b.p - a.p)
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', formatter: (p: Array<{ name: string; value: number }>) => `${p[0].name}: ${(p[0].value * 100).toFixed(2)}%` },
    grid: { left: 80, right: 20, top: 8, bottom: 8 },
    xAxis: { type: 'value', max: 1, axisLabel: { color: '#64748b', formatter: (v: number) => `${(v * 100).toFixed(0)}%`, fontSize: 9 }, splitLine: { lineStyle: { color: '#1e293b' } } },
    yAxis: { type: 'category', data: sorted.map(s => s.name), axisLabel: { color: '#94a3b8', fontSize: 10 }, axisLine: { lineStyle: { color: '#1e293b' } } },
    series: [{
      type: 'bar', data: sorted.map(s => s.p), barMaxWidth: 18,
      itemStyle: {
        color: (p: { dataIndex: number }) => p.dataIndex === 0 ? '#3b82f6' : '#1e3a5f',
        borderRadius: [0, 4, 4, 0],
      },
      label: { show: true, position: 'right', color: '#94a3b8', fontSize: 9, formatter: (p: { value: number }) => `${(p.value * 100).toFixed(1)}%` },
    }],
  }
}

const MODEL_LAYERS = [
  { name: 'GCNConv', in_dim: 'F', out_dim: 64 },
  { name: 'ReLU',    in_dim: 64,  out_dim: 64 },
  { name: 'GCNConv', in_dim: 64,  out_dim: 32 },
  { name: 'ReLU',    in_dim: 32,  out_dim: 32 },
  { name: 'GlobalMeanPool', in_dim: 32, out_dim: 32 },
  { name: 'FC',      in_dim: 32,  out_dim: 'C' },
]

export default function ZKGCNPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [assetsLoading, setAssetsLoading] = useState(true)
  const [assetId, setAssetId] = useState('')
  const [numClasses, setNumClasses] = useState(3)
  const [loading, setLoading] = useState(false)
  const [tamperLoading, setTamperLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ZKGCNResult | null>(null)
  const [tampered, setTampered] = useState(false)

  const loadAssets = useCallback(async () => {
    setAssetsLoading(true)
    try {
      const data = await getAssets()
      setAssets((data?.assets ?? data ?? []) as Asset[])
    } catch { setAssets([]) }
    finally { setAssetsLoading(false) }
  }, [])

  useEffect(() => { loadAssets() }, [loadAssets])

  const handleInfer = async () => {
    if (!assetId) return setError('请先选择数据资产')
    setError(''); setLoading(true); setResult(null); setTampered(false)
    try {
      setResult(await runZKGCN({ asset_id: assetId, num_classes: numClasses }))
    } catch (e: unknown) { setError(e instanceof Error ? e.message : '推理失败') }
    finally { setLoading(false) }
  }

  const handleTamper = async () => {
    if (!assetId) return setError('请先选择数据资产')
    setError(''); setTamperLoading(true); setResult(null); setTampered(true)
    try {
      setResult(await runZKGCNTamper({ asset_id: assetId, num_classes: numClasses }))
    } catch (e: unknown) { setError(e instanceof Error ? e.message : '篡改演示失败') }
    finally { setTamperLoading(false) }
  }

  const proof = result?.proof
  const graphNodes = result?.graph?.nodes ?? []
  const graphEdges = result?.graph?.edges ?? []
  const adjMatrix  = result?.graph?.adjacency_matrix ?? []
  const probs      = result?.probabilities ?? []
  const classNames = result?.class_names ?? probs.map((_, i) => `类别${i}`)
  const predClass  = result?.predicted_class ?? 0
  const r1cs       = result?.r1cs_constraints ?? []
  const timing     = result?.timing ?? {}

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-tech">zkGCN 可验证图神经网络推理</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Zero-Knowledge GCN — 使用 zk-SNARK 证明图神经网络推理结果的正确性
          </p>
        </div>
        <button onClick={loadAssets} className="btn btn-secondary" disabled={assetsLoading}>
          <RefreshCw className={`w-4 h-4 ${assetsLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left control panel */}
        <div className="space-y-4">
          <div className="card-glow p-5 space-y-4">
            <h2 className="section-header">推理配置</h2>
            <div>
              <label className="form-label">数据资产</label>
              <select className="form-input" value={assetId} onChange={e => setAssetId(e.target.value)}>
                <option value="">-- 请选择 --</option>
                {assets.map(a => <option key={a.asset_id} value={a.asset_id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">分类数: {numClasses}</label>
              <input type="range" min="2" max="10" step="1" value={numClasses} onChange={e => setNumClasses(Number(e.target.value))} className="w-full accent-blue-500 mt-2" />
              <div className="flex justify-between text-xs text-slate-500 mt-0.5"><span>2</span><span>10</span></div>
            </div>
            {error && <p className="alert-error text-xs">{error}</p>}
            <button onClick={handleInfer} disabled={loading || !assetId} className="btn btn-primary w-full gap-2 justify-center">
              {loading ? <LoadingSpinner size="sm" /> : <Brain className="w-4 h-4" />}
              {loading ? '推理中...' : '执行推理'}
            </button>
            <button onClick={handleTamper} disabled={tamperLoading || !assetId} className="btn btn-danger w-full gap-2 justify-center">
              {tamperLoading ? <LoadingSpinner size="sm" /> : <AlertTriangle className="w-4 h-4" />}
              {tamperLoading ? '演示中...' : '篡改演示'}
            </button>
          </div>

          {/* Model structure */}
          <div className="card-glow p-5">
            <h2 className="section-header">模型结构</h2>
            <div className="space-y-1.5">
              {MODEL_LAYERS.map((layer, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg px-3 py-2"
                  style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid #1e293b' }}>
                  <Layers className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-xs font-semibold text-slate-200">{layer.name}</span>
                  </div>
                  <div className="text-xs font-mono text-slate-500">
                    {layer.in_dim}→{layer.out_dim}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Middle: Graph + results */}
        <div className="xl:col-span-2 space-y-4">
          {(loading || tamperLoading) && (
            <div className="card-glow p-5">
              <LoadingSpinner message="执行图神经网络推理并生成零知识证明..." className="py-12" size="lg" />
            </div>
          )}

          {result && !loading && !tamperLoading && (
            <>
              {/* Graph visualization + Adjacency matrix */}
              {(graphNodes.length > 0 || adjMatrix.length > 0) && (
                <div className="grid grid-cols-2 gap-4">
                  {graphNodes.length > 0 && (
                    <div className="card-glow p-4">
                      <p className="section-header text-xs">图结构可视化</p>
                      <ReactECharts
                        option={buildGraphOption(graphNodes, graphEdges, predClass)}
                        style={{ height: 220 }}
                        opts={{ renderer: 'canvas' }}
                      />
                    </div>
                  )}
                  {adjMatrix.length > 0 && (
                    <div className="card-glow p-4">
                      <p className="section-header text-xs">邻接矩阵热图</p>
                      <ReactECharts option={buildAdjHeatmap(adjMatrix)} style={{ height: 220 }} />
                    </div>
                  )}
                </div>
              )}

              {/* Inference result */}
              <div className="card-glow p-5">
                <h3 className="section-header">推理结果</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-400 mb-2">预测类别</p>
                    <div className="flex items-center gap-3">
                      <div className="badge badge-blue text-xl px-6 py-3 font-black">
                        {result.class_name ?? `类别 ${predClass}`}
                      </div>
                      <div>
                        <p className="text-2xl font-black text-blue-400">#{predClass}</p>
                        <p className="text-xs text-slate-500">预测标签</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-2">概率分布</p>
                    {probs.length > 0 && (
                      <ReactECharts option={buildProbBar(probs, classNames)} style={{ height: 120 }} />
                    )}
                  </div>
                </div>
              </div>

              {/* Proof panel */}
              {proof && (
                <div className="card-glow p-5">
                  <h3 className="section-header">零知识证明信息</h3>

                  {/* Tamper warning */}
                  {tampered && !proof.verify_result && (
                    <div className="alert-error flex items-center gap-3 mb-4 font-bold">
                      <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0" />
                      <div>
                        <p>证明验证失败！推理结果不可信</p>
                        <p className="text-sm font-normal opacity-80 mt-0.5">
                          服务器返回了篡改后的推理结果，zk-SNARK 验证检测到矛盾，证明无效。
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    {[
                      { label: 'Proving Key Hash', value: proof.pk_hash, color: '#3b82f6' },
                      { label: 'Verification Key Hash', value: proof.vk_hash, color: '#a78bfa' },
                      { label: 'Witness Hash', value: proof.witness_hash, color: '#22d3ee' },
                      { label: 'Public Input', value: proof.public_input, color: '#10b981' },
                      { label: 'Proof Hash', value: proof.proof_hash, color: '#f59e0b' },
                    ].map(({ label, value, color }) => value ? (
                      <div key={label}>
                        <p className="text-xs font-semibold mb-1" style={{ color }}>{label}</p>
                        <p className="hash-display" style={{ color }}>{value.length > 48 ? value.slice(0, 48) + '...' : value}</p>
                      </div>
                    ) : null)}
                  </div>

                  {/* Verify badge */}
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-slate-400">证明验证：</span>
                    {proof.verify_result ? (
                      <div className="flex items-center gap-2 badge badge-green text-lg px-6 py-2.5">
                        <CheckCircle2 className="w-6 h-6" />
                        <span className="font-black">验证通过 ✓</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 badge badge-red text-lg px-6 py-2.5">
                        <XCircle className="w-6 h-6" />
                        <span className="font-black">验证失败 ✗</span>
                      </div>
                    )}
                  </div>

                  {/* Timing */}
                  {Object.keys(timing).length > 0 && (
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      {[
                        { label: '证明时间', value: `${timing.prove_ms?.toFixed(0) ?? '-'} ms`, color: '#f59e0b' },
                        { label: '验证时间', value: `${timing.verify_ms?.toFixed(0) ?? '-'} ms`, color: '#10b981' },
                        { label: '证明大小', value: `${result.proof_size_kb?.toFixed(1) ?? '-'} KB`, color: '#3b82f6' },
                      ].map(m => (
                        <div key={m.label} className="rounded-lg p-3 text-center" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b' }}>
                          <p className="text-lg font-black font-mono" style={{ color: m.color }}>{m.value}</p>
                          <p className="text-xs text-slate-500">{m.label}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* R1CS table */}
              {r1cs.length > 0 && (
                <div className="card-glow p-5">
                  <h3 className="section-header">R1CS 约束信息</h3>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>层</th>
                        <th>操作</th>
                        <th>约束数</th>
                        <th>哈希</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r1cs.map((row, i) => (
                        <tr key={i}>
                          <td className="text-blue-300 font-semibold">{row.layer}</td>
                          <td className="text-slate-300">{row.operation}</td>
                          <td className="font-mono text-cyan-400">{row.constraints.toLocaleString()}</td>
                          <td className="hash-display text-xs">{row.hash.slice(0, 20)}...</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {!result && !loading && !tamperLoading && (
            <div className="card-glow flex flex-col items-center justify-center py-20">
              <Brain className="w-16 h-16 text-slate-600 mb-4" />
              <p className="text-slate-500 text-base">选择数据资产并点击"执行推理"开始</p>
              <p className="text-slate-600 text-sm mt-2">系统将自动执行 GCN 推理并生成 zk-SNARK 证明</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
