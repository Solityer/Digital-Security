import { useState, useEffect, useCallback } from 'react'
import {
  FileText, Plus, RefreshCw, Play, CheckCircle2, XCircle,
  ShieldCheck, X,
} from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import { getContracts, createContract, activateContract, evaluateAuthz } from '../api/endpoints'
import dayjs from 'dayjs'

const ROLES = ['数据提供方', '数据使用方', '监管机构', '审计员', '平台管理员', '研究员', '普通用户']
const ALGORITHMS_OPTIONS = ['Graph-SDP', 'GCC-SDP', 'GS-LDP', 'NDKD', 'VPCS', 'zkGCN', '联邦学习', '全局分析']
const FIELD_OPTIONS = ['节点ID', '节点属性', '边权重', '度分布', '聚类系数', '路径信息', '子图结构', '全量数据']

const CONTRACT_STATUS: Record<string, { label: string; cls: string }> = {
  draft:      { label: '草稿',   cls: 'badge-gray' },
  pending:    { label: '待审核', cls: 'badge-yellow' },
  active:     { label: '已生效', cls: 'badge-green' },
  suspended:  { label: '已暂停', cls: 'badge-orange' },
  terminated: { label: '已终止', cls: 'badge-red' },
}

interface Contract {
  contract_id: string
  title: string
  provider: string
  consumer: string
  purpose: string
  status: string
  valid_from?: string
  valid_until?: string
  accessible_fields?: string[]
  allowed_algorithms?: string[]
  privacy_budget_limit?: number
  created_at?: string
}

interface AuthzResult {
  allowed: boolean
  reason?: string
  matched_rule?: string
  details?: Record<string, unknown>
}

export default function Contracts() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const [activating, setActivating] = useState<string | null>(null)
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)

  // Authz evaluation state
  const [authzForm, setAuthzForm] = useState({
    user_role: '数据使用方',
    user_attrs: '{}',
    asset_id: '',
    operation: 'read',
  })
  const [authzLoading, setAuthzLoading] = useState(false)
  const [authzResult, setAuthzResult] = useState<AuthzResult | null>(null)
  const [authzError, setAuthzError] = useState('')

  const [form, setForm] = useState({
    title: '',
    provider: '',
    consumer: '',
    purpose: '',
    valid_from: '',
    valid_until: '',
    accessible_fields: [] as string[],
    allowed_algorithms: [] as string[],
    privacy_budget_limit: 10.0,
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getContracts()
      setContracts(data?.contracts ?? data ?? [])
    } catch {
      setContracts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormLoading(true)
    try {
      await createContract(form as unknown as Record<string, unknown>)
      setShowForm(false)
      await load()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setFormLoading(false)
    }
  }

  const handleActivate = async (id: string) => {
    setActivating(id)
    try {
      await activateContract(id)
      await load()
    } catch {}
    setActivating(null)
  }

  const handleEvaluate = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthzError('')
    setAuthzLoading(true)
    try {
      let parsedAttrs: Record<string, unknown> = {}
      try { parsedAttrs = JSON.parse(authzForm.user_attrs) } catch {}
      const result = await evaluateAuthz({
        user_role: authzForm.user_role,
        user_attrs: parsedAttrs,
        asset_id: authzForm.asset_id,
        operation: authzForm.operation,
        contract_id: selectedContract?.contract_id,
      })
      setAuthzResult(result)
    } catch (err: unknown) {
      setAuthzError(err instanceof Error ? err.message : '评估失败')
    } finally {
      setAuthzLoading(false)
    }
  }

  const toggleField = (list: 'accessible_fields' | 'allowed_algorithms', val: string) => {
    setForm(f => ({
      ...f,
      [list]: (f[list] as string[]).includes(val)
        ? (f[list] as string[]).filter(v => v !== val)
        : [...(f[list] as string[]), val],
    }))
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-tech">合约与授权管理</h1>
          <p className="text-slate-400 text-sm mt-0.5">管理数据流通合约，配置访问控制策略</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn btn-secondary" disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowForm(true)} className="btn btn-primary gap-2">
            <Plus className="w-4 h-4" /> 新建合约
          </button>
        </div>
      </div>

      {/* Create form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="card-glow w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 animate-slide-in">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-100">新建数据流通合约</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="form-label">合约标题 *</label>
                  <input className="form-input" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="如：金融风控联合分析合约" />
                </div>
                <div>
                  <label className="form-label">数据提供方 *</label>
                  <input className="form-input" required value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} placeholder="机构名称" />
                </div>
                <div>
                  <label className="form-label">数据需求方 *</label>
                  <input className="form-input" required value={form.consumer} onChange={e => setForm(f => ({ ...f, consumer: e.target.value }))} placeholder="机构名称" />
                </div>
                <div className="col-span-2">
                  <label className="form-label">使用目的</label>
                  <input className="form-input" value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} placeholder="如：反欺诈联合建模" />
                </div>
                <div>
                  <label className="form-label">有效期开始</label>
                  <input type="date" className="form-input" value={form.valid_from} onChange={e => setForm(f => ({ ...f, valid_from: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">有效期结束</label>
                  <input type="date" className="form-input" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">隐私预算上限: {form.privacy_budget_limit}</label>
                  <input type="range" min="0.1" max="50" step="0.1" value={form.privacy_budget_limit}
                    onChange={e => setForm(f => ({ ...f, privacy_budget_limit: Number(e.target.value) }))}
                    className="w-full accent-blue-500 mt-2" />
                </div>
              </div>
              <div>
                <label className="form-label">可访问字段</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {FIELD_OPTIONS.map(f => (
                    <button type="button" key={f} onClick={() => toggleField('accessible_fields', f)}
                      className={`badge cursor-pointer ${form.accessible_fields.includes(f) ? 'badge-cyan' : 'badge-gray'}`}
                    >{f}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="form-label">允许算法</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {ALGORITHMS_OPTIONS.map(a => (
                    <button type="button" key={a} onClick={() => toggleField('allowed_algorithms', a)}
                      className={`badge cursor-pointer ${form.allowed_algorithms.includes(a) ? 'badge-purple' : 'badge-gray'}`}
                    >{a}</button>
                  ))}
                </div>
              </div>
              {formError && <p className="alert-error">{formError}</p>}
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">取消</button>
                <button type="submit" disabled={formLoading} className="btn btn-primary gap-2">
                  {formLoading ? <LoadingSpinner size="sm" /> : <FileText className="w-4 h-4" />}
                  {formLoading ? '创建中...' : '创建合约'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Contract list */}
        <div className="xl:col-span-2 card-glow p-5">
          <h2 className="section-header">合约列表</h2>
          {loading ? (
            <LoadingSpinner message="加载合约..." className="py-10" />
          ) : contracts.length === 0 ? (
            <div className="text-center py-10">
              <FileText className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">暂无合约，点击"新建合约"创建</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>标题</th>
                    <th>提供方</th>
                    <th>需求方</th>
                    <th>有效期</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map(c => {
                    const s = CONTRACT_STATUS[c.status] ?? { label: c.status, cls: 'badge-gray' }
                    return (
                      <tr key={c.contract_id}
                        className={`cursor-pointer ${selectedContract?.contract_id === c.contract_id ? 'bg-blue-900/20' : ''}`}
                        onClick={() => setSelectedContract(c)}
                      >
                        <td className="font-semibold text-slate-100 truncate max-w-36">{c.title}</td>
                        <td className="text-slate-400 truncate max-w-24">{c.provider}</td>
                        <td className="text-slate-400 truncate max-w-24">{c.consumer}</td>
                        <td className="text-xs text-slate-400 font-mono">
                          {c.valid_from ? dayjs(c.valid_from).format('YYYY-MM-DD') : '—'}<br />
                          {c.valid_until ? `至 ${dayjs(c.valid_until).format('YYYY-MM-DD')}` : ''}
                        </td>
                        <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                        <td>
                          {c.status === 'pending' || c.status === 'draft' ? (
                            <button
                              onClick={e => { e.stopPropagation(); handleActivate(c.contract_id) }}
                              disabled={activating === c.contract_id}
                              className="btn btn-success text-xs py-1 px-2 gap-1"
                            >
                              {activating === c.contract_id ? <LoadingSpinner size="sm" /> : <Play className="w-3.5 h-3.5" />}
                              激活
                            </button>
                          ) : c.status === 'active' ? (
                            <span className="text-emerald-400 text-xs flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> 生效中
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right panel: detail + authz */}
        <div className="space-y-4">
          {/* Contract detail */}
          {selectedContract && (
            <div className="card-glow p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-100">合约详情</h3>
                <button onClick={() => setSelectedContract(null)}><X className="w-4 h-4 text-slate-500" /></button>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="text-slate-500 w-20">合约ID</span>
                  <span className="hash-display text-xs">{selectedContract.contract_id.slice(0, 20)}...</span>
                </div>
                {[
                  ['使用目的', selectedContract.purpose],
                  ['隐私预算', selectedContract.privacy_budget_limit != null ? String(selectedContract.privacy_budget_limit) : undefined],
                ].map(([k, v]) => v ? (
                  <div key={k} className="flex gap-2">
                    <span className="text-slate-500 w-20">{k}</span>
                    <span className="text-slate-300">{v}</span>
                  </div>
                ) : null)}
                {selectedContract.accessible_fields && selectedContract.accessible_fields.length > 0 && (
                  <div>
                    <p className="text-slate-500 mb-1">可访问字段</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedContract.accessible_fields.map(f => <span key={f} className="badge badge-cyan text-xs">{f}</span>)}
                    </div>
                  </div>
                )}
                {selectedContract.allowed_algorithms && selectedContract.allowed_algorithms.length > 0 && (
                  <div>
                    <p className="text-slate-500 mb-1">允许算法</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedContract.allowed_algorithms.map(a => <span key={a} className="badge badge-purple text-xs">{a}</span>)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* RBAC/ABAC Evaluation */}
          <div className="card-glow p-4">
            <h3 className="section-header text-sm">RBAC/ABAC 授权评估</h3>
            <form onSubmit={handleEvaluate} className="space-y-3">
              <div>
                <label className="form-label">用户角色</label>
                <select className="form-input" value={authzForm.user_role} onChange={e => setAuthzForm(f => ({ ...f, user_role: e.target.value }))}>
                  {ROLES.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">用户属性 (JSON)</label>
                <textarea
                  className="form-input h-16 resize-none font-mono text-xs"
                  value={authzForm.user_attrs}
                  onChange={e => setAuthzForm(f => ({ ...f, user_attrs: e.target.value }))}
                  placeholder='{"dept": "finance", "clearance": 3}'
                />
              </div>
              <div>
                <label className="form-label">资产ID</label>
                <input className="form-input" value={authzForm.asset_id} onChange={e => setAuthzForm(f => ({ ...f, asset_id: e.target.value }))} placeholder="asset_xxx" />
              </div>
              <div>
                <label className="form-label">操作类型</label>
                <select className="form-input" value={authzForm.operation} onChange={e => setAuthzForm(f => ({ ...f, operation: e.target.value }))}>
                  {['read', 'write', 'compute', 'export', 'delete', 'share'].map(op => <option key={op}>{op}</option>)}
                </select>
              </div>
              {authzError && <p className="alert-error text-xs">{authzError}</p>}
              <button type="submit" disabled={authzLoading} className="btn btn-primary w-full gap-2 justify-center">
                {authzLoading ? <LoadingSpinner size="sm" /> : <ShieldCheck className="w-4 h-4" />}
                {authzLoading ? '评估中...' : '评估授权'}
              </button>
            </form>

            {/* Authz result */}
            {authzResult && (
              <div className={`mt-4 p-3 rounded-lg border ${authzResult.allowed ? 'alert-success' : 'alert-error'}`}>
                <div className="flex items-center gap-2 font-bold">
                  {authzResult.allowed
                    ? <><CheckCircle2 className="w-5 h-5 text-emerald-400" /> <span className="text-emerald-300">授权通过</span></>
                    : <><XCircle className="w-5 h-5 text-red-400" /> <span className="text-red-300">授权拒绝</span></>
                  }
                </div>
                {authzResult.reason && (
                  <p className="mt-2 text-xs opacity-80">{authzResult.reason}</p>
                )}
                {authzResult.matched_rule && (
                  <p className="mt-1 text-xs opacity-70">匹配规则：{authzResult.matched_rule}</p>
                )}
                {authzResult.details && Object.keys(authzResult.details).length > 0 && (
                  <div className="mt-2 border-t border-current/20 pt-2">
                    <p className="text-xs font-semibold mb-1">评估详情</p>
                    {Object.entries(authzResult.details).map(([k, v]) => (
                      <div key={k} className="text-xs flex gap-2">
                        <span className="opacity-60">{k}:</span>
                        <span className="font-mono">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Contract stats */}
      {contracts.length > 0 && (
        <div className="card-glow p-5">
          <h2 className="section-header">合约状态统计</h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(CONTRACT_STATUS).map(([status, { label, cls }]) => {
              const cnt = contracts.filter(c => c.status === status).length
              return (
                <div key={status} className={`badge ${cls} text-sm px-4 py-2`}>
                  {label}：{cnt}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
