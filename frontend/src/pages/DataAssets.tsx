import { useState, useEffect, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  Database, Plus, RefreshCw, Eye, GitBranch, Layers,
  X, Download,
} from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import { getAssets, createAsset, getAsset, generateAssetGraph } from '../api/endpoints'
import dayjs from 'dayjs'

const INDUSTRIES = ['金融', '医疗', '政务', '交通', '教育', '工业', '电信', '零售', '能源', '其他']
const SUBJECT_TYPES = ['自然人', '法人', '设备', '事件', '地理位置', '机构', '其他']
const SENSITIVITY = [1, 2, 3, 4, 5]
const COMPLIANCE_TAGS_OPTIONS = ['GDPR', '个人信息保护法', '数据安全法', '网络安全法', 'ISO27001', 'SOC2', '等保三级', 'PCI-DSS']
const AUTH_SCOPES = ['公开', '内部', '合规授权', '仅限研究', '政府专用']

interface Asset {
  id: string
  name: string
  industry: string
  data_source?: string
  subject_type?: string
  node_meaning?: string
  edge_meaning?: string
  sensitivity_level?: number
  authorization_scope?: string
  compliance_tags?: string[]
  description?: string
  node_count?: number
  edge_count?: number
  status?: string
  asset_hash?: string
  ownership_credential?: string
  chain_record?: string
  created_at?: string
}

interface GraphData {
  nodes?: Array<{ id: string; label?: string; [k: string]: unknown }>
  edges?: Array<{ source: string; target: string; [k: string]: unknown }>
}

const sensitivityColor = ['', '#10b981', '#22d3ee', '#f59e0b', '#f97316', '#ef4444']
const sensitivityLabel = ['', '极低', '低', '中', '高', '极高']
const statusMap: Record<string, { label: string; cls: string }> = {
  active:   { label: '已激活', cls: 'badge-green' },
  inactive: { label: '未激活', cls: 'badge-gray' },
  pending:  { label: '待审核', cls: 'badge-yellow' },
  draft:    { label: '草稿',   cls: 'badge-gray' },
}

function buildGraphOption(graphData: GraphData) {
  const nodes = (graphData.nodes ?? []).map((n, i) => ({
    id: String(n.id ?? i),
    name: String(n.label ?? n.id ?? i),
    symbolSize: 30 + Math.random() * 20,
    itemStyle: { color: `hsl(${(i * 47) % 360}, 70%, 55%)` },
    label: { show: true, color: '#e2e8f0', fontSize: 10 },
  }))
  const links = (graphData.edges ?? []).map((e) => ({
    source: String(e.source),
    target: String(e.target),
  }))
  return {
    backgroundColor: 'transparent',
    tooltip: { show: true, formatter: (p: { name?: string }) => p.name ?? '' },
    series: [{
      type: 'graph',
      layout: 'force',
      data: nodes,
      links,
      roam: true,
      force: { repulsion: 120, edgeLength: 80 },
      lineStyle: { color: 'rgba(59,130,246,0.4)', width: 1.5 },
      emphasis: { focus: 'adjacency' },
    }],
  }
}

export default function DataAssets() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [graphLoading, setGraphLoading] = useState(false)
  const [graphError, setGraphError] = useState('')
  const [formError, setFormError] = useState('')
  const [formLoading, setFormLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    industry: '金融',
    data_source: '',
    subject_type: '自然人',
    node_meaning: '',
    edge_meaning: '',
    sensitivity_level: 3,
    authorization_scope: '内部',
    compliance_tags: [] as string[],
    description: '',
  })

  const loadAssets = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAssets()
      setAssets(data?.items ?? data?.assets ?? data ?? [])
    } catch {
      setAssets([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAssets() }, [loadAssets])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormLoading(true)
    try {
      await createAsset(form as unknown as Record<string, unknown>)
      setShowForm(false)
      setForm({ name: '', industry: '金融', data_source: '', subject_type: '自然人', node_meaning: '', edge_meaning: '', sensitivity_level: 3, authorization_scope: '内部', compliance_tags: [], description: '' })
      await loadAssets()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setFormLoading(false)
    }
  }

  const handleViewAsset = async (asset: Asset) => {
    setSelectedAsset(asset)
    setGraphData(null)
    try {
      const data = await getAsset(asset.id)
      setSelectedAsset(data?.asset ?? data)
    } catch {}
  }

  const handleGenerateGraph = async () => {
    if (!selectedAsset) return
    setGraphLoading(true)
    setGraphError('')
    try {
      const data = await generateAssetGraph(selectedAsset.id)
      setGraphData(data?.graph ?? data)
    } catch (err: unknown) {
      setGraphError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setGraphLoading(false)
    }
  }

  const toggleTag = (tag: string) => {
    setForm(f => ({
      ...f,
      compliance_tags: f.compliance_tags.includes(tag)
        ? f.compliance_tags.filter(t => t !== tag)
        : [...f.compliance_tags, tag],
    }))
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-tech">数据资产登记</h1>
          <p className="text-slate-400 text-sm mt-0.5">管理与登记图数据资产，查看图谱可视化</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadAssets} className="btn btn-secondary" disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowForm(true)} className="btn btn-primary gap-2">
            <Plus className="w-4 h-4" />
            登记新资产
          </button>
        </div>
      </div>

      {/* Create form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="card-glow w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 animate-slide-in">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-100">登记新数据资产</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-200"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">资产名称 *</label>
                  <input className="form-input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="如：企业征信图谱" />
                </div>
                <div>
                  <label className="form-label">所属行业</label>
                  <select className="form-input" value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}>
                    {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">数据来源</label>
                  <input className="form-input" value={form.data_source} onChange={e => setForm(f => ({ ...f, data_source: e.target.value }))} placeholder="如：央行征信中心" />
                </div>
                <div>
                  <label className="form-label">主体类型</label>
                  <select className="form-input" value={form.subject_type} onChange={e => setForm(f => ({ ...f, subject_type: e.target.value }))}>
                    {SUBJECT_TYPES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">节点含义</label>
                  <input className="form-input" value={form.node_meaning} onChange={e => setForm(f => ({ ...f, node_meaning: e.target.value }))} placeholder="如：企业、个人" />
                </div>
                <div>
                  <label className="form-label">边含义</label>
                  <input className="form-input" value={form.edge_meaning} onChange={e => setForm(f => ({ ...f, edge_meaning: e.target.value }))} placeholder="如：借贷关系、担保关系" />
                </div>
                <div>
                  <label className="form-label">授权范围</label>
                  <select className="form-input" value={form.authorization_scope} onChange={e => setForm(f => ({ ...f, authorization_scope: e.target.value }))}>
                    {AUTH_SCOPES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">敏感度：{sensitivityLabel[form.sensitivity_level]} (L{form.sensitivity_level})</label>
                  <input type="range" min={1} max={5} step={1} value={form.sensitivity_level} onChange={e => setForm(f => ({ ...f, sensitivity_level: Number(e.target.value) }))} className="w-full accent-blue-500 mt-2" />
                  <div className="flex justify-between text-xs text-slate-500 mt-0.5">
                    {SENSITIVITY.map(l => <span key={l}>{l}</span>)}
                  </div>
                </div>
              </div>
              <div>
                <label className="form-label">合规标签</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {COMPLIANCE_TAGS_OPTIONS.map(tag => (
                    <button type="button" key={tag} onClick={() => toggleTag(tag)}
                      className={`badge cursor-pointer transition-all ${form.compliance_tags.includes(tag) ? 'badge-blue' : 'badge-gray'}`}
                    >{tag}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="form-label">描述</label>
                <textarea className="form-input h-20 resize-none" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="数据集描述信息..." />
              </div>
              {formError && <p className="alert-error">{formError}</p>}
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">取消</button>
                <button type="submit" disabled={formLoading} className="btn btn-primary gap-2">
                  {formLoading ? <LoadingSpinner size="sm" /> : <Database className="w-4 h-4" />}
                  {formLoading ? '登记中...' : '确认登记'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Asset list */}
        <div className="xl:col-span-2 card-glow p-5">
          <h2 className="section-header">资产列表</h2>
          {loading ? (
            <LoadingSpinner message="加载资产列表..." className="py-10" />
          ) : assets.length === 0 ? (
            <div className="text-center py-10">
              <Database className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500">暂无数据资产，点击"登记新资产"开始</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>行业</th>
                    <th>节点数</th>
                    <th>边数</th>
                    <th>敏感度</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map(asset => {
                    const s = statusMap[asset.status ?? 'active'] ?? { label: asset.status, cls: 'badge-gray' }
                    const lvl = asset.sensitivity_level ?? 3
                    return (
                      <tr key={asset.id} className={selectedAsset?.id === asset.id ? 'bg-blue-900/20' : ''}>
                        <td className="font-semibold text-slate-100">{asset.name}</td>
                        <td><span className="badge badge-blue">{asset.industry}</span></td>
                        <td className="font-mono text-cyan-400">{(asset.node_count ?? 0).toLocaleString()}</td>
                        <td className="font-mono text-purple-400">{(asset.edge_count ?? 0).toLocaleString()}</td>
                        <td>
                          <span className="font-semibold text-xs" style={{ color: sensitivityColor[lvl] }}>
                            L{lvl} {sensitivityLabel[lvl]}
                          </span>
                        </td>
                        <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                        <td>
                          <button onClick={() => handleViewAsset(asset)} className="btn btn-secondary text-xs py-1 px-2 gap-1">
                            <Eye className="w-3.5 h-3.5" /> 查看
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Asset detail */}
        <div className="card-glow p-5">
          {!selectedAsset ? (
            <div className="text-center py-12">
              <Layers className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">选择一个资产查看详情</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <h2 className="text-base font-bold text-slate-100">{selectedAsset.name}</h2>
                <button onClick={() => { setSelectedAsset(null); setGraphData(null) }} className="text-slate-500 hover:text-slate-300">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Meta info */}
              <div className="space-y-2 text-sm">
                {[
                  ['行业', selectedAsset.industry],
                  ['数据来源', selectedAsset.data_source],
                  ['主体类型', selectedAsset.subject_type],
                  ['节点含义', selectedAsset.node_meaning],
                  ['边含义', selectedAsset.edge_meaning],
                  ['授权范围', selectedAsset.authorization_scope],
                  ['创建时间', selectedAsset.created_at ? dayjs(selectedAsset.created_at).format('YYYY-MM-DD HH:mm') : '-'],
                ].map(([k, v]) => v ? (
                  <div key={k} className="flex gap-2">
                    <span className="text-slate-500 flex-shrink-0 w-20">{k}</span>
                    <span className="text-slate-300 break-all">{v}</span>
                  </div>
                ) : null)}
                <div className="flex gap-2">
                  <span className="text-slate-500 w-20">敏感度</span>
                  <span style={{ color: sensitivityColor[selectedAsset.sensitivity_level ?? 3] }}>
                    L{selectedAsset.sensitivity_level} {sensitivityLabel[selectedAsset.sensitivity_level ?? 3]}
                  </span>
                </div>
              </div>

              <div className="divider" />

              {/* Hashes */}
              {selectedAsset.asset_hash && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">资产哈希</p>
                  <p className="hash-display">{selectedAsset.asset_hash.slice(0, 40)}...</p>
                </div>
              )}
              {selectedAsset.ownership_credential && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">所有权凭证</p>
                  <p className="hash-display">{selectedAsset.ownership_credential.slice(0, 40)}...</p>
                </div>
              )}
              {selectedAsset.chain_record && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">链上记录</p>
                  <p className="hash-display text-emerald-400">{selectedAsset.chain_record.slice(0, 40)}...</p>
                </div>
              )}

              {/* Generate graph */}
              <button
                onClick={handleGenerateGraph}
                disabled={graphLoading}
                className="btn btn-cyan w-full gap-2 justify-center"
              >
                {graphLoading ? <LoadingSpinner size="sm" /> : <GitBranch className="w-4 h-4" />}
                {graphLoading ? '生成中...' : '生成图谱'}
              </button>
              {graphError && <p className="alert-error text-xs">{graphError}</p>}

              {/* Graph visualization */}
              {graphData && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-slate-400">
                      <GitBranch className="w-3.5 h-3.5 inline mr-1" />
                      {(graphData.nodes ?? []).length} 节点 · {(graphData.edges ?? []).length} 边
                    </p>
                    <button
                      className="btn btn-secondary text-xs py-1 px-2 gap-1"
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(graphData, null, 2)], { type: 'application/json' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url; a.download = `${selectedAsset.name}-graph.json`; a.click()
                      }}
                    >
                      <Download className="w-3.5 h-3.5" /> 导出
                    </button>
                  </div>
                  <ReactECharts
                    option={buildGraphOption(graphData)}
                    style={{ height: 280 }}
                    opts={{ renderer: 'canvas' }}
                  />
                </div>
              )}

              {/* Compliance tags */}
              {selectedAsset.compliance_tags && selectedAsset.compliance_tags.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">合规标签</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedAsset.compliance_tags.map(t => (
                      <span key={t} className="badge badge-purple">{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats summary */}
      {assets.length > 0 && (
        <div className="card-glow p-5">
          <h2 className="section-header">资产统计</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-black text-blue-400">{assets.length}</p>
              <p className="text-xs text-slate-500 mt-1">总资产数</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-cyan-400">{assets.filter(a => a.status === 'active').length}</p>
              <p className="text-xs text-slate-500 mt-1">已激活</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-emerald-400">
                {assets.reduce((s, a) => s + (a.node_count ?? 0), 0).toLocaleString()}
              </p>
              <p className="text-xs text-slate-500 mt-1">总节点数</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-purple-400">
                {assets.reduce((s, a) => s + (a.edge_count ?? 0), 0).toLocaleString()}
              </p>
              <p className="text-xs text-slate-500 mt-1">总边数</p>
            </div>
          </div>
          {/* Industry breakdown */}
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(
              assets.reduce((acc, a) => {
                acc[a.industry] = (acc[a.industry] ?? 0) + 1
                return acc
              }, {} as Record<string, number>)
            ).map(([ind, cnt]) => (
              <span key={ind} className="badge badge-blue">{ind} ({cnt})</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
