import { useCallback, useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  Lock, AlertTriangle, CheckCircle2, XCircle,
  RefreshCw, Shield, Network,
} from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import StepTimeline, { type Step } from '../components/StepTimeline'
import { getAssets, getAsset, runVPCSQuery, runVPCSTamper } from '../api/endpoints'
import { getGraphData, getId, safeNumber, safeString, toArray, toObject } from '../api/normalizers'

interface Asset {
  id?: string
  asset_id?: string
  name: string
}

interface VPCSResponse {
  path?: string[]
  result_path?: string[]
  distance?: number
  result_distance?: number
  cost?: number
  result_cost?: number
  time?: number
  result_time?: number
  proof_hash?: string
  verify_result?: boolean
  encrypted_graph?: {
    node_count?: number
    real_edges?: number
    dummy_edges?: number
    matrix_checksum?: string
  }
  encrypted_graph_summary?: {
    node_count?: number
    edge_count?: number
    master_hash?: string
  }
  explanation_steps?: Array<Record<string, unknown>>
  elapsed_ms?: number
}

function buildPathOption(path: string[]) {
  const nodes = path.map((node, index) => ({
    id: node,
    name: node,
    symbolSize: index === 0 || index === path.length - 1 ? 38 : 28,
    itemStyle: {
      color: index === 0 ? '#10b981' : index === path.length - 1 ? '#f59e0b' : '#3b82f6',
      borderColor: '#60a5fa',
      borderWidth: 2,
    },
    label: { show: true, color: '#e2e8f0', fontSize: 10 },
  }))
  const links = path.slice(0, -1).map((node, index) => ({
    source: node,
    target: path[index + 1],
    lineStyle: { color: '#3b82f6', width: 3 },
    symbol: ['none', 'arrow'],
  }))

  return {
    backgroundColor: 'transparent',
    tooltip: { show: true },
    series: [{
      type: 'graph',
      layout: 'force',
      data: nodes,
      links,
      roam: true,
      force: { repulsion: 120, edgeLength: 90 },
      lineStyle: { color: 'rgba(59,130,246,0.3)', width: 1 },
    }],
  }
}

function stepsFromExplanation(steps: Array<Record<string, unknown>>, tampered: boolean): Step[] {
  return steps.map((step, index) => ({
    id: `vpcs-step-${index}`,
    label: safeString(step.description, `步骤 ${index + 1}`),
    description: safeString(step.detail, ''),
    status: tampered && index === steps.length - 1 ? 'error' : 'success',
    detail: `阶段 ${safeString(step.step, String(index + 1))}`,
  }))
}

export default function VPCSQuery() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [assetsLoading, setAssetsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [assetId, setAssetId] = useState('')
  const [sourceNode, setSourceNode] = useState('0')
  const [targetNode, setTargetNode] = useState('10')
  const [costThreshold, setCostThreshold] = useState(100)
  const [timeThreshold, setTimeThreshold] = useState(50)
  const [distanceConstraint, setDistanceConstraint] = useState(5)
  const [budget, setBudget] = useState(1000)
  const [nodeOptions, setNodeOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [tamperLoading, setTamperLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<VPCSResponse | null>(null)
  const [tampered, setTampered] = useState(false)

  const loadAssets = useCallback(async () => {
    setAssetsLoading(true)
    setLoadError('')
    try {
      const data = await getAssets()
      setAssets(toArray<Asset>(data, ['items', 'assets']))
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : '资产列表加载失败')
      setAssets([])
    } finally {
      setAssetsLoading(false)
    }
  }, [])

  useEffect(() => { loadAssets() }, [loadAssets])

  useEffect(() => {
    let active = true
    if (!assetId) {
      setNodeOptions([])
      return () => { active = false }
    }

    ;(async () => {
      try {
        const detail = await getAsset(assetId)
        const graph = getGraphData(detail?.graph_snapshot ?? detail)
        const options = toArray(graph.nodes).map((node) => safeString(node?.id)).filter(Boolean).slice(0, 32)
        if (!active) return
        setNodeOptions(options)
        if (options.length > 0) {
          setSourceNode((current) => options.includes(current) ? current : options[0])
          setTargetNode((current) => options.includes(current) ? current : (options[1] ?? options[0]))
        }
      } catch {
        if (active) setNodeOptions([])
      }
    })()

    return () => { active = false }
  }, [assetId])

  const execute = async (mode: 'query' | 'tamper') => {
    if (!assetId) {
      setError('请先选择数据资产')
      return
    }
    setError('')
    setResult(null)
    setTampered(mode === 'tamper')

    const payload = {
      asset_id: Number(assetId),
      source_node: sourceNode,
      target_node: targetNode,
      cost_threshold: costThreshold,
      time_threshold: timeThreshold,
      distance_constraint: distanceConstraint,
      budget,
    }

    try {
      if (mode === 'query') {
        setLoading(true)
        const data = await runVPCSQuery(payload)
        setResult(toObject<VPCSResponse>(data, {} as VPCSResponse))
      } else {
        setTamperLoading(true)
        const data = await runVPCSTamper(payload)
        setResult(toObject<VPCSResponse>(data, {} as VPCSResponse))
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : mode === 'query' ? '查询失败' : '篡改演示失败')
    } finally {
      setLoading(false)
      setTamperLoading(false)
    }
  }

  const assetList = toArray<Asset>(assets)
  const pathNodes = toArray<string>(result?.path ?? result?.result_path)
  const encryptedGraph = toObject(result?.encrypted_graph, {
    node_count: result?.encrypted_graph_summary?.node_count,
    real_edges: safeNumber(result?.encrypted_graph_summary?.edge_count),
    dummy_edges: 0,
    matrix_checksum: result?.encrypted_graph_summary?.master_hash,
  })
  const steps = stepsFromExplanation(toArray(result?.explanation_steps), tampered)
  const metricCards = [
    { label: '路径长度', value: (result?.distance ?? result?.result_distance) != null ? safeNumber(result?.distance ?? result?.result_distance).toFixed(2) : '-', color: '#3b82f6' },
    { label: '路径费用', value: (result?.cost ?? result?.result_cost) != null ? safeNumber(result?.cost ?? result?.result_cost).toFixed(2) : '-', color: '#10b981' },
    { label: '耗时(ms)', value: result?.elapsed_ms != null ? safeNumber(result.elapsed_ms).toFixed(1) : '-', color: '#f59e0b' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-tech">VPCS 加密路径查询</h1>
          <p className="text-slate-400 text-sm mt-0.5">Verifiable Private Constrained Shortest-path 演示页</p>
        </div>
        <button onClick={loadAssets} className="btn btn-secondary" disabled={assetsLoading}>
          <RefreshCw className={`w-4 h-4 ${assetsLoading ? 'animate-spin' : ''}`} />
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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="card-glow p-5 space-y-4">
          <h2 className="section-header">查询参数</h2>

          <div>
            <label className="form-label">数据资产</label>
            <select className="form-input" value={assetId} onChange={(event) => setAssetId(event.target.value)}>
              <option value="">-- 请选择 --</option>
              {assetList.map((asset) => <option key={getId(asset)} value={getId(asset)}>{safeString(asset.name, '未命名资产')}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">起点节点</label>
              {nodeOptions.length > 0 ? (
                <select className="form-input" value={sourceNode} onChange={(event) => setSourceNode(event.target.value)}>
                  {nodeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              ) : (
                <input className="form-input" value={sourceNode} onChange={(event) => setSourceNode(event.target.value)} />
              )}
            </div>
            <div>
              <label className="form-label">终点节点</label>
              {nodeOptions.length > 0 ? (
                <select className="form-input" value={targetNode} onChange={(event) => setTargetNode(event.target.value)}>
                  {nodeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              ) : (
                <input className="form-input" value={targetNode} onChange={(event) => setTargetNode(event.target.value)} />
              )}
            </div>
          </div>

          <div>
            <label className="form-label">费用阈值: {costThreshold}</label>
            <input type="range" min="10" max="500" step="10" value={costThreshold} onChange={(event) => setCostThreshold(Number(event.target.value))} className="w-full accent-blue-500" />
          </div>
          <div>
            <label className="form-label">时间阈值: {timeThreshold}</label>
            <input type="range" min="5" max="200" step="5" value={timeThreshold} onChange={(event) => setTimeThreshold(Number(event.target.value))} className="w-full accent-cyan-500" />
          </div>
          <div>
            <label className="form-label">距离约束: {distanceConstraint} 跳</label>
            <input type="range" min="1" max="15" step="1" value={distanceConstraint} onChange={(event) => setDistanceConstraint(Number(event.target.value))} className="w-full accent-purple-500" />
          </div>
          <div>
            <label className="form-label">查询预算: {budget}</label>
            <input type="range" min="100" max="5000" step="100" value={budget} onChange={(event) => setBudget(Number(event.target.value))} className="w-full accent-green-500" />
          </div>

          {error ? <p className="alert-error text-xs">{error}</p> : null}

          <div className="flex gap-2 pt-2">
            <button onClick={() => execute('query')} disabled={loading || !assetId} className="btn btn-primary flex-1 gap-2 justify-center">
              {loading ? <LoadingSpinner size="sm" /> : <Lock className="w-4 h-4" />}
              {loading ? '查询中...' : '执行查询'}
            </button>
            <button onClick={() => execute('tamper')} disabled={tamperLoading || !assetId} className="btn btn-danger flex-1 gap-2 justify-center">
              {tamperLoading ? <LoadingSpinner size="sm" /> : <AlertTriangle className="w-4 h-4" />}
              {tamperLoading ? '演示中...' : '篡改演示'}
            </button>
          </div>

          <div>
            <p className="section-header mt-4">协议步骤</p>
            {steps.length > 0 ? <StepTimeline steps={steps} /> : <p className="text-sm text-slate-500">执行后展示协议步骤。</p>}
          </div>
        </div>

        <div className="xl:col-span-2 space-y-4">
          {(loading || tamperLoading) ? (
            <div className="card-glow p-5">
              <LoadingSpinner message="加密路径搜索中..." className="py-10" size="lg" />
            </div>
          ) : null}

          {result ? (
            <>
              <div className="card-glow p-5">
                <h3 className="section-header">加密图摘要</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: '节点数', value: encryptedGraph.node_count ?? '-', color: '#3b82f6' },
                    { label: '真实边', value: encryptedGraph.real_edges ?? '-', color: '#10b981' },
                    { label: '虚假边', value: encryptedGraph.dummy_edges ?? '-', color: '#f59e0b' },
                    { label: '矩阵校验', value: encryptedGraph.matrix_checksum ? `${encryptedGraph.matrix_checksum.slice(0, 10)}...` : '-', color: '#a78bfa' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg p-3 text-center" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b' }}>
                      <p className="text-xl font-black font-mono" style={{ color: item.color }}>{item.value}</p>
                      <p className="text-xs text-slate-500 mt-1">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card-glow p-5">
                <h3 className="section-header">查询结果</h3>
                {tampered && result.verify_result === false ? (
                  <div className="alert-error flex items-center gap-3 text-base font-bold mb-4">
                    <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0" />
                    <div>
                      <p>验证失败，检测到篡改结果。</p>
                      <p className="text-sm font-normal opacity-80 mt-0.5">本次查询结果与证明不一致，页面已明确标记为不可信。</p>
                    </div>
                  </div>
                ) : null}

                {pathNodes.length > 0 ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-slate-400 mb-2 flex items-center gap-1.5">
                        <Network className="w-3.5 h-3.5" />
                        查询路径：{pathNodes.join(' → ')}
                      </p>
                      <ReactECharts option={buildPathOption(pathNodes)} style={{ height: 240 }} opts={{ renderer: 'canvas' }} />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {metricCards.map((item) => (
                        <div key={item.label} className="rounded-lg p-3 text-center" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b' }}>
                          <p className="text-xl font-black font-mono" style={{ color: item.color }}>{item.value}</p>
                          <p className="text-xs text-slate-500 mt-1">{item.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">当前结果没有返回可视化路径，已保留证明信息供核验。</p>
                )}
              </div>

              <div className="card-glow p-5">
                <h3 className="section-header">证明验证</h3>
                {result.proof_hash ? (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">证明哈希</p>
                    <p className="hash-display">{result.proof_hash}</p>
                  </div>
                ) : null}
                <div className="flex items-center gap-4 mt-4">
                  <span className="text-sm text-slate-400">验证结果：</span>
                  {result.verify_result ? (
                    <div className="flex items-center gap-2 badge badge-green text-base px-4 py-1.5">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="font-bold">验证通过</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 badge badge-red text-base px-4 py-1.5">
                      <XCircle className="w-5 h-5" />
                      <span className="font-bold">验证失败</span>
                    </div>
                  )}
                </div>
                <div className="mt-4 p-3 rounded-lg" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b' }}>
                  <p className="text-xs text-slate-400">
                    <Shield className="w-3.5 h-3.5 inline mr-1 text-blue-400" />
                    查询结果、路径统计和加密图摘要被共同绑定到 proof hash，评委可直接对比正常查询与篡改演示的验证结果。
                  </p>
                </div>
              </div>
            </>
          ) : (!loading && !tamperLoading) ? (
            <div className="card-glow flex flex-col items-center justify-center py-20">
              <Lock className="w-16 h-16 text-slate-600 mb-4" />
              <p className="text-slate-500 text-base">选择资产并执行查询后，这里会展示真实路径、证明哈希和验证结果。</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )

}
