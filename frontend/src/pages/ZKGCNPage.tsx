import { useCallback, useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  Brain, CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  Layers,
} from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import StepTimeline, { type Step } from '../components/StepTimeline'
import { getAssets, runZKGCN, runZKGCNTamper } from '../api/endpoints'
import { getId, safeNumber, safeString, toArray, toObject } from '../api/normalizers'

interface Asset {
  id?: string
  asset_id?: string
  name: string
}

interface ZKGCNResponse {
  predicted_class?: number
  class_name?: string
  proof_hash?: string
  verify_result?: boolean
  elapsed_ms?: number
  proof_size_kb?: number
  inference_result?: {
    class_distribution?: Record<string, number>
    mean_confidence?: number
    min_confidence?: number
    max_confidence?: number
    node_predictions?: Record<string, { class?: number; confidence?: number }>
  }
  layer_summaries?: Array<Record<string, unknown>>
  explanation_steps?: Array<Record<string, unknown>>
  witness_summary?: Record<string, unknown>
  adjacency_summary?: Record<string, unknown>
  pk_hash?: string
  vk_hash?: string
  public_input_hash?: string
}

function buildDistributionOption(data: Record<string, number>) {
  const entries = Object.entries(data)
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 12, top: 12, bottom: 24 },
    xAxis: { type: 'category', data: entries.map(([key]) => `类别 ${key}`), axisLabel: { color: '#64748b', fontSize: 9 }, axisLine: { lineStyle: { color: '#1e293b' } } },
    yAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 9 }, splitLine: { lineStyle: { color: '#1e293b' } } },
    series: [{
      type: 'bar',
      data: entries.map(([, value], index) => ({
        value,
        itemStyle: { color: ['#3b82f6', '#10b981', '#f59e0b', '#a78bfa'][index % 4], borderRadius: [4, 4, 0, 0] },
      })),
      barMaxWidth: 26,
    }],
  }
}

function stepsFromExplanation(steps: Array<Record<string, unknown>>, tampered: boolean): Step[] {
  return steps.map((step, index) => ({
    id: `zkgcn-step-${index}`,
    label: safeString(step.description, `步骤 ${index + 1}`),
    description: safeString(step.detail, ''),
    status: tampered && index === steps.length - 1 ? 'error' : 'success',
    detail: `阶段 ${safeString(step.step, String(index + 1))}`,
  }))
}

const MODEL_LAYERS = [
  { name: 'GCNConv', desc: '图卷积层，提取一阶邻接特征' },
  { name: 'ReLU', desc: '非线性激活' },
  { name: 'GCNConv', desc: '第二层图卷积' },
  { name: 'Softmax', desc: '输出类别分布' },
]

export default function ZKGCNPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [assetsLoading, setAssetsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [assetId, setAssetId] = useState('')
  const [layers, setLayers] = useState(2)
  const [hiddenDim, setHiddenDim] = useState(64)
  const [modelType, setModelType] = useState('gcn')
  const [loading, setLoading] = useState(false)
  const [tamperLoading, setTamperLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ZKGCNResponse | null>(null)
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

  const execute = async (mode: 'infer' | 'tamper') => {
    if (!assetId) {
      setError('请先选择数据资产')
      return
    }
    setError('')
    setResult(null)
    setTampered(mode === 'tamper')

    const payload = {
      asset_id: Number(assetId),
      layers,
      hidden_dim: hiddenDim,
      model_type: modelType,
    }

    try {
      if (mode === 'infer') {
        setLoading(true)
        const data = await runZKGCN(payload)
        setResult(toObject<ZKGCNResponse>(data, {} as ZKGCNResponse))
      } else {
        setTamperLoading(true)
        const data = await runZKGCNTamper(payload)
        setResult(toObject<ZKGCNResponse>(data, {} as ZKGCNResponse))
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : mode === 'infer' ? '推理失败' : '完整性校验任务失败')
    } finally {
      setLoading(false)
      setTamperLoading(false)
    }
  }

  const assetList = toArray<Asset>(assets)
  const inference = toObject<NonNullable<ZKGCNResponse['inference_result']>>(
    result?.inference_result,
    {} as NonNullable<ZKGCNResponse['inference_result']>,
  )
  const classDistribution = toObject<Record<string, number>>(inference.class_distribution, {})
  const layerSummaries = toArray<Record<string, unknown>>(result?.layer_summaries)
  const steps = stepsFromExplanation(toArray(result?.explanation_steps), tampered)
  const witnessSummary = toObject<Record<string, unknown>>(result?.witness_summary, {})
  const adjacencySummary = toObject<Record<string, unknown>>(result?.adjacency_summary, {})

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-tech">可验证图智能推理</h1>
          <p className="text-slate-400 text-sm mt-0.5">推理完整性验证、模型输出可信校验与证明摘要</p>
        </div>
        <button onClick={loadAssets} className="btn btn-secondary" disabled={assetsLoading}>
          <RefreshCw className={`w-4 h-4 ${assetsLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 技术边界声明 */}
      <div className="rounded-lg px-4 py-2.5 text-xs" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
        <span className="text-amber-300 font-semibold">技术实现说明：</span>
        <span className="text-amber-200/80 ml-1">
          当前系统采用分层见证摘要、推理约束校验和证明摘要链路实现推理完整性验证。
          对于严格零知识证明场景，可扩展接入 R1CS 电路编译与 Groth16、PLONK 等证明系统。
        </span>
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
        <div className="space-y-4">
          <div className="card-glow p-5 space-y-4">
            <h2 className="section-header">推理配置</h2>
            <div>
              <label className="form-label">数据资产</label>
              <select className="form-input" value={assetId} onChange={(event) => setAssetId(event.target.value)}>
                <option value="">-- 请选择 --</option>
                {assetList.map((asset) => <option key={getId(asset)} value={getId(asset)}>{safeString(asset.name, '未命名资产')}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">GCN 层数: {layers}</label>
              <input type="range" min="1" max="4" step="1" value={layers} onChange={(event) => setLayers(Number(event.target.value))} className="w-full accent-blue-500 mt-2" />
            </div>
            <div>
              <label className="form-label">隐藏维度: {hiddenDim}</label>
              <input type="range" min="16" max="128" step="16" value={hiddenDim} onChange={(event) => setHiddenDim(Number(event.target.value))} className="w-full accent-cyan-500 mt-2" />
            </div>
            <div>
              <label className="form-label">模型类型</label>
              <select className="form-input" value={modelType} onChange={(event) => setModelType(event.target.value)}>
                <option value="gcn">GCN</option>
                <option value="gin">GIN</option>
                <option value="graphsage">GraphSAGE</option>
              </select>
            </div>
            {error ? <p className="alert-error text-xs">{error}</p> : null}
            <button onClick={() => execute('infer')} disabled={loading || !assetId} className="btn btn-primary w-full gap-2 justify-center">
              {loading ? <LoadingSpinner size="sm" /> : <Brain className="w-4 h-4" />}
              {loading ? '推理中...' : '执行推理'}
            </button>
            <button onClick={() => execute('tamper')} disabled={tamperLoading || !assetId} className="btn btn-danger w-full gap-2 justify-center">
              {tamperLoading ? <LoadingSpinner size="sm" /> : <AlertTriangle className="w-4 h-4" />}
              {tamperLoading ? '校验中...' : '异常校验场景'}
            </button>
          </div>

          <div className="card-glow p-5">
            <h2 className="section-header">模型结构</h2>
            <div className="space-y-1.5">
              {MODEL_LAYERS.map((layer) => (
                <div key={layer.name} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid #1e293b' }}>
                  <Layers className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-slate-200">{layer.name}</p>
                    <p className="text-xs text-slate-500">{layer.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card-glow p-5">
            <h2 className="section-header">证明步骤</h2>
            {steps.length > 0 ? <StepTimeline steps={steps} /> : <p className="text-sm text-slate-500">执行推理后展示证明步骤。</p>}
          </div>
        </div>

        <div className="xl:col-span-2 space-y-4">
          {(loading || tamperLoading) ? (
            <div className="card-glow p-5">
              <LoadingSpinner message="执行图神经网络推理并生成零知识证明..." className="py-12" size="lg" />
            </div>
          ) : null}

          {result ? (
            <>
              <div className="card-glow p-5">
                <h3 className="section-header">推理结果</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-400 mb-2">预测类别</p>
                    <div className="flex items-center gap-3">
                      <div className="badge badge-blue text-xl px-6 py-3 font-black">{safeString(result.class_name, `类别 ${safeNumber(result.predicted_class)}`)}</div>
                      <div>
                        <p className="text-2xl font-black text-blue-400">#{safeNumber(result.predicted_class)}</p>
                        <p className="text-xs text-slate-500">主导类别</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-2">推理摘要</p>
                    <div className="space-y-2 text-sm text-slate-300">
                      <p>平均置信度：{safeNumber(inference.mean_confidence).toFixed(4)}</p>
                      <p>最小置信度：{safeNumber(inference.min_confidence).toFixed(4)}</p>
                      <p>最大置信度：{safeNumber(inference.max_confidence).toFixed(4)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {Object.keys(classDistribution).length > 0 ? (
                <div className="card-glow p-5">
                  <h3 className="section-header">类别分布</h3>
                  <ReactECharts option={buildDistributionOption(classDistribution)} style={{ height: 240 }} />
                </div>
              ) : null}

              <div className="card-glow p-5">
                <h3 className="section-header">零知识证明信息</h3>
                {tampered && result.verify_result === false ? (
                  <div className="alert-error flex items-center gap-3 mb-4 font-bold">
                    <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0" />
                    <div>
                      <p>证明验证失败，说明推理结果已出现完整性异常。</p>
                      <p className="text-sm font-normal opacity-80 mt-0.5">完整性校验链路已成功拦截异常结果。</p>
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: '证明时间', value: `${safeNumber(result.elapsed_ms).toFixed(1)} ms`, color: '#f59e0b' },
                    { label: '证明大小', value: `${safeNumber(result.proof_size_kb).toFixed(2)} KB`, color: '#3b82f6' },
                    { label: '验证结果', value: result.verify_result ? '通过' : '失败', color: result.verify_result ? '#10b981' : '#ef4444' },
                    { label: '层摘要数', value: String(layerSummaries.length), color: '#a78bfa' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg p-3 text-center" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b' }}>
                      <p className="text-lg font-black font-mono" style={{ color: item.color }}>{item.value}</p>
                      <p className="text-xs text-slate-500 mt-1">{item.label}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  {[
                    ['Proof Hash', result.proof_hash],
                    ['Proving Key Hash', result.pk_hash],
                    ['Verification Key Hash', result.vk_hash],
                    ['Public Input Hash', result.public_input_hash],
                  ].map(([label, value]) => value ? (
                    <div key={label}>
                      <p className="text-xs text-slate-500 mb-1">{label}</p>
                      <p className="hash-display">{safeString(value)}</p>
                    </div>
                  ) : null)}
                </div>

                {(Object.keys(witnessSummary).length > 0 || Object.keys(adjacencySummary).length > 0) ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="rounded-lg p-3" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b' }}>
                      <p className="text-xs text-slate-500 mb-2">Witness 摘要</p>
                      <div className="space-y-1 text-xs text-slate-300">
                        {Object.entries(witnessSummary).map(([key, value]) => (
                          <div key={key} className="flex justify-between gap-3">
                            <span className="text-slate-500">{key}</span>
                            <span className="font-mono">{safeString(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-lg p-3" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b' }}>
                      <p className="text-xs text-slate-500 mb-2">Public Input 摘要</p>
                      <div className="space-y-1 text-xs text-slate-300">
                        {Object.entries(adjacencySummary).map(([key, value]) => (
                          <div key={key} className="flex justify-between gap-3">
                            <span className="text-slate-500">{key}</span>
                            <span className="font-mono">{safeString(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center gap-4 mt-4">
                  <span className="text-sm text-slate-400">证明验证：</span>
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
              </div>

              {layerSummaries.length > 0 ? (
                <div className="card-glow p-5">
                  <h3 className="section-header">层摘要</h3>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>层</th>
                        <th>形状</th>
                        <th>均值</th>
                        <th>标准差</th>
                      </tr>
                    </thead>
                    <tbody>
                      {layerSummaries.map((row, index) => (
                        <tr key={`layer-${index}`}>
                          <td className="text-blue-300 font-semibold">{safeString(row.layer, String(index))}</td>
                          <td className="font-mono text-slate-300">{safeString(Array.isArray(row.shape) ? row.shape.join('×') : row.shape, '-')}</td>
                          <td className="font-mono text-cyan-400">{safeNumber(row.mean).toFixed(6)}</td>
                          <td className="font-mono text-cyan-400">{safeNumber(row.std).toFixed(6)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          ) : (!loading && !tamperLoading) ? (
            <div className="card-glow flex flex-col items-center justify-center py-20">
              <Brain className="w-16 h-16 text-slate-600 mb-4" />
              <p className="text-slate-500 text-base">选择资产并点击“执行推理”后，这里会展示预测类别、证明哈希和验证结果。</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )

}
