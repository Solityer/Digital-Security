import { useState, useEffect, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  Lock, AlertTriangle, CheckCircle2, XCircle,
  RefreshCw, Shield, Network,
} from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import StepTimeline, { Step } from '../components/StepTimeline'
import { getAssets, runVPCSQuery, runVPCSTamper } from '../api/endpoints'

interface Asset { asset_id: string; name: string }

interface VPCSResult {
  path?: string[]
  path_nodes?: string[]
  distance?: number
  cost?: number
  time?: number
  proof_hash?: string
  verify_result?: boolean
  encrypted_graph?: {
    node_count?: number
    real_edges?: number
    dummy_edges?: number
    matrix_checksum?: string
  }
  protocol_steps?: Array<{ role: string; message: string; timestamp?: string }>
  error?: string
}

function buildPathOption(nodes: string[], path: string[]) {
  const pathSet = new Set(path)
  const pathEdges: { source: string; target: string }[] = []
  for (let i = 0; i < path.length - 1; i++) {
    pathEdges.push({ source: path[i], target: path[i + 1] })
  }

  const allNodes = [...new Set([...nodes, ...path])]
  const ecNodes = allNodes.map((n) => {
    const isPath = pathSet.has(n)
    return {
      id: n,
      name: n,
      symbolSize: isPath ? 36 : 20,
      itemStyle: {
        color: n === path[0] ? '#10b981' : n === path[path.length - 1] ? '#f59e0b' : isPath ? '#3b82f6' : '#334155',
        borderColor: isPath ? '#60a5fa' : '#1e293b',
        borderWidth: isPath ? 2 : 1,
      },
      label: { show: isPath, color: '#e2e8f0', fontSize: 10 },
    }
  })
  const ecLinks = pathEdges.map(e => ({
    source: e.source, target: e.target,
    lineStyle: { color: '#3b82f6', width: 3 },
    symbol: ['none', 'arrow'],
  }))

  return {
    backgroundColor: 'transparent',
    tooltip: { show: true },
    series: [{
      type: 'graph',
      layout: 'force',
      data: ecNodes,
      links: ecLinks,
      roam: true,
      force: { repulsion: 100, edgeLength: 80 },
      lineStyle: { color: 'rgba(59,130,246,0.3)', width: 1 },
    }],
  }
}

function buildProtocolSteps(steps: VPCSResult['protocol_steps'], tampered: boolean): Step[] {
  const roles = ['GO', 'CS', 'Proxy', 'QU']
  const descs = [
    'Graph Owner：发起查询请求，提交加密图数据',
    'Cloud Server：接收请求，执行加密路径搜索',
    'Proxy：转发查询，处理密钥转换',
    'Query User：接收结果，验证证明',
  ]
  if (steps && steps.length > 0) {
    return steps.map((s, i) => ({
      id: `step-${i}`,
      label: s.role ?? roles[i] ?? `步骤${i + 1}`,
      description: s.message ?? descs[i] ?? '',
      status: tampered && i === steps.length - 1 ? 'error' : 'success',
      timestamp: s.timestamp,
    }))
  }
  return roles.map((role, i) => ({
    id: `step-${i}`,
    label: role,
    description: descs[i],
    status: 'pending' as const,
  }))
}

export default function VPCSQuery() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [assetsLoading, setAssetsLoading] = useState(true)
  const [assetId, setAssetId] = useState('')
  const [sourceNode, setSourceNode] = useState('v1')
  const [targetNode, setTargetNode] = useState('v5')
  const [costThreshold, setCostThreshold] = useState(100)
  const [timeThreshold, setTimeThreshold] = useState(50)
  const [distanceConstraint, setDistanceConstraint] = useState(5)
  const [budget, setBudget] = useState(1000)
  const [loading, setLoading] = useState(false)
  const [tamperLoading, setTamperLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<VPCSResult | null>(null)
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

  const handleQuery = async () => {
    if (!assetId) return setError('请先选择数据资产')
    setError(''); setLoading(true); setResult(null); setTampered(false)
    try {
      const data = await runVPCSQuery({
        asset_id: assetId,
        source_node: sourceNode,
        target_node: targetNode,
        cost_threshold: costThreshold,
        time_threshold: timeThreshold,
        distance_constraint: distanceConstraint,
        budget,
      })
      setResult(data)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : '查询失败') }
    finally { setLoading(false) }
  }

  const handleTamper = async () => {
    if (!assetId) return setError('请先选择数据资产')
    setError(''); setTamperLoading(true); setResult(null); setTampered(true)
    try {
      const data = await runVPCSTamper({
        asset_id: assetId,
        source_node: sourceNode,
        target_node: targetNode,
      })
      setResult(data)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : '篡改演示失败') }
    finally { setTamperLoading(false) }
  }

  const pathNodes = result?.path ?? result?.path_nodes ?? []
  const encGraph = result?.encrypted_graph
  const protocolSteps = buildProtocolSteps(result?.protocol_steps, tampered)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-tech">VPCS 加密路径查询</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Verifiable Private Constrained Shortest-path — 加密图上的可验证隐私路径查询
          </p>
        </div>
        <button onClick={loadAssets} className="btn btn-secondary" disabled={assetsLoading}>
          <RefreshCw className={`w-4 h-4 ${assetsLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Query panel */}
        <div className="card-glow p-5 space-y-4">
          <h2 className="section-header">查询参数</h2>

          <div>
            <label className="form-label">数据资产</label>
            <select className="form-input" value={assetId} onChange={e => setAssetId(e.target.value)}>
              <option value="">-- 请选择 --</option>
              {assets.map(a => <option key={a.asset_id} value={a.asset_id}>{a.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">起点节点</label>
              <input className="form-input" value={sourceNode} onChange={e => setSourceNode(e.target.value)} placeholder="v1" />
            </div>
            <div>
              <label className="form-label">终点节点</label>
              <input className="form-input" value={targetNode} onChange={e => setTargetNode(e.target.value)} placeholder="v5" />
            </div>
          </div>

          <div>
            <label className="form-label">费用阈值: {costThreshold}</label>
            <input type="range" min="10" max="500" step="10" value={costThreshold} onChange={e => setCostThreshold(Number(e.target.value))} className="w-full accent-blue-500" />
          </div>
          <div>
            <label className="form-label">时间阈值: {timeThreshold}</label>
            <input type="range" min="5" max="200" step="5" value={timeThreshold} onChange={e => setTimeThreshold(Number(e.target.value))} className="w-full accent-cyan-500" />
          </div>
          <div>
            <label className="form-label">距离约束: {distanceConstraint} 跳</label>
            <input type="range" min="1" max="15" step="1" value={distanceConstraint} onChange={e => setDistanceConstraint(Number(e.target.value))} className="w-full accent-purple-500" />
          </div>
          <div>
            <label className="form-label">查询预算: {budget}</label>
            <input type="range" min="100" max="5000" step="100" value={budget} onChange={e => setBudget(Number(e.target.value))} className="w-full accent-green-500" />
          </div>

          {error && <p className="alert-error text-xs">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button onClick={handleQuery} disabled={loading || !assetId} className="btn btn-primary flex-1 gap-2 justify-center">
              {loading ? <LoadingSpinner size="sm" /> : <Lock className="w-4 h-4" />}
              {loading ? '查询中...' : '执行查询'}
            </button>
            <button onClick={handleTamper} disabled={tamperLoading || !assetId} className="btn btn-danger flex-1 gap-2 justify-center">
              {tamperLoading ? <LoadingSpinner size="sm" /> : <AlertTriangle className="w-4 h-4" />}
              {tamperLoading ? '演示中...' : '篡改演示'}
            </button>
          </div>

          {/* Protocol steps */}
          <div>
            <p className="section-header mt-4">协议交互流程</p>
            <StepTimeline steps={protocolSteps.map(s => ({
              ...s,
              status: loading || tamperLoading ? (protocolSteps.indexOf(s) === 0 ? 'running' : 'pending') : s.status,
            }))} />
          </div>
        </div>

        {/* Right: Results */}
        <div className="xl:col-span-2 space-y-4">
          {/* Encrypted graph summary */}
          {(encGraph || loading) && (
            <div className="card-glow p-5">
              <h3 className="section-header">加密图摘要</h3>
              {loading ? <LoadingSpinner className="py-4" /> : encGraph && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: '节点数', value: encGraph.node_count ?? '-', color: '#3b82f6' },
                    { label: '真实边', value: encGraph.real_edges ?? '-', color: '#10b981' },
                    { label: '虚假边', value: encGraph.dummy_edges ?? '-', color: '#f59e0b' },
                    { label: '矩阵校验', value: encGraph.matrix_checksum ? encGraph.matrix_checksum.slice(0, 8) + '...' : '-', color: '#a78bfa' },
                  ].map(item => (
                    <div key={item.label} className="rounded-lg p-3 text-center" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b' }}>
                      <p className="text-xl font-black font-mono" style={{ color: item.color }}>{item.value}</p>
                      <p className="text-xs text-slate-500 mt-1">{item.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Main result */}
          {(result || loading) && (
            <div className="card-glow p-5">
              <h3 className="section-header">查询结果</h3>
              {loading || tamperLoading ? (
                <LoadingSpinner message="加密路径搜索中..." className="py-10" size="lg" />
              ) : result && (
                <div className="space-y-4">
                  {/* Tamper alert */}
                  {tampered && !result.verify_result && (
                    <div className="alert-error flex items-center gap-3 text-base font-bold">
                      <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0" />
                      <div>
                        <p>验证失败！服务器返回结果与证明不符</p>
                        <p className="text-sm font-normal opacity-80 mt-0.5">检测到服务器篡改：查询结果被恶意修改，零知识证明验证失败，本次结果不可信！</p>
                      </div>
                    </div>
                  )}

                  {/* Path viz */}
                  {pathNodes.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-400 mb-2 flex items-center gap-1.5">
                        <Network className="w-3.5 h-3.5" />
                        查询路径：{pathNodes.join(' → ')}
                      </p>
                      <ReactECharts
                        option={buildPathOption(pathNodes, pathNodes)}
                        style={{ height: 220 }}
                        opts={{ renderer: 'canvas' }}
                      />
                    </div>
                  )}

                  {/* Path metrics */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: '路径长度', value: result.distance != null ? result.distance.toFixed(2) : '-', color: '#3b82f6' },
                      { label: '路径费用', value: result.cost != null ? result.cost.toFixed(2) : '-', color: '#10b981' },
                      { label: '耗时(ms)', value: result.time != null ? result.time.toFixed(1) : '-', color: '#f59e0b' },
                    ].map(m => (
                      <div key={m.label} className="rounded-lg p-3 text-center" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b' }}>
                        <p className="text-xl font-black font-mono" style={{ color: m.color }}>{m.value}</p>
                        <p className="text-xs text-slate-500 mt-1">{m.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Proof panel */}
          {result && !loading && !tamperLoading && (
            <div className="card-glow p-5">
              <h3 className="section-header">零知识证明验证</h3>
              <div className="space-y-3">
                {result.proof_hash && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">证明哈希 (Proof Hash)</p>
                    <p className="hash-display">{result.proof_hash}</p>
                  </div>
                )}
                <div className="flex items-center gap-4 mt-3">
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
                <div className="mt-2 p-3 rounded-lg" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b' }}>
                  <p className="text-xs text-slate-400">
                    <Shield className="w-3.5 h-3.5 inline mr-1 text-blue-400" />
                    VPCS 协议使用同态加密保护查询隐私，服务器在密文上完成路径搜索，
                    通过零知识证明允许查询方独立验证结果正确性，无需信任服务器。
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
