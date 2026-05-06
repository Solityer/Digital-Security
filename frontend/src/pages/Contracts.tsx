import { useCallback, useEffect, useState } from 'react'
import {
  FileText, Plus, RefreshCw, Play, CheckCircle2, XCircle,
  ShieldCheck, X, ClipboardList,
} from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import { getContracts, getAssets, createContract, activateContract, evaluateAuthz } from '../api/endpoints'
import { getId, safeString, toArray } from '../api/normalizers'
import dayjs from 'dayjs'

const PARTY_OPTIONS = [
  { id: '1', label: 'admin（平台管理员）' },
  { id: '2', label: 'analyst（数据分析师）' },
  { id: '3', label: 'auditor（审计专员）' },
  { id: '4', label: 'observer（业务观察员）' },
]

const ROLE_OPTIONS = [
  { label: '平台管理员', value: 'admin' },
  { label: '数据分析师', value: 'analyst' },
  { label: '审计专员', value: 'auditor' },
  { label: '业务观察员', value: 'demo' },
]

const OPERATION_OPTIONS = [
  { label: '读取', value: 'read' },
  { label: '分析', value: 'analyze' },
  { label: '导出', value: 'export' },
  { label: '执行算法', value: 'run_algorithm' },
  { label: '查询', value: 'query' },
]

const ALGORITHMS_OPTIONS = ['Graph-SDP', 'GCC-SDP', 'GS-LDP', 'NDKD', 'VPCS', 'zkGCN']
const FIELD_OPTIONS = ['节点标识', '节点标签', '边权重', '路径摘要', '聚类系数', '风险等级', '区域编码', '服务目录']

const CONTRACT_STATUS: Record<string, { label: string; cls: string }> = {
  draft:      { label: '草稿', cls: 'badge-gray' },
  pending:    { label: '待审批', cls: 'badge-yellow' },
  active:     { label: '已生效', cls: 'badge-green' },
  suspended:  { label: '已暂停', cls: 'badge-orange' },
  terminated: { label: '已终止', cls: 'badge-red' },
}

interface Asset {
  id?: string
  asset_id?: string
  name: string
}

interface Contract {
  id?: string
  contract_id: string
  title: string
  provider_id?: number | string
  consumer_id?: number | string
  provider: string
  consumer: string
  purpose: string
  status: string
  valid_from?: string
  valid_until?: string
  accessible_fields?: string[]
  allowed_algorithms?: string[]
  privacy_budget_limit?: number
  contract_hash?: string
  created_at?: string
}

interface AuthzResult {
  allowed: boolean
  reason?: string
  matched_rule?: string
  matched_policy_id?: number
  details?: Record<string, unknown>
}

export default function Contracts() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const [activating, setActivating] = useState<string | null>(null)
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'info'; text: string } | null>(null)

  const [authzForm, setAuthzForm] = useState({
    user_role: 'analyst',
    user_attrs: '{"dept":"联合风控中心","clearance":"level-2","purpose":"风控分析"}',
    asset_id: '',
    operation: 'analyze',
  })
  const [authzLoading, setAuthzLoading] = useState(false)
  const [authzResult, setAuthzResult] = useState<AuthzResult | null>(null)
  const [authzError, setAuthzError] = useState('')

  const [form, setForm] = useState({
    title: '',
    provider_id: '1',
    consumer_id: '2',
    purpose: '',
    valid_from: '',
    valid_until: '',
    accessible_fields: [] as string[],
    allowed_algorithms: [] as string[],
    privacy_budget_limit: 1.5,
    status: 'draft',
  })

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [contractData, assetData] = await Promise.all([getContracts(), getAssets()])
      const contractItems = toArray<Contract>(contractData, ['items', 'contracts'])
      const assetItems = toArray<Asset>(assetData, ['items', 'assets'])
      setContracts(contractItems)
      setAssets(assetItems)
      setSelectedContract((current) => {
        if (!current) return contractItems[0] ?? null
        return contractItems.find((item) => getId(item) === getId(current)) ?? contractItems[0] ?? null
      })
      setAuthzForm((current) => ({
        ...current,
        asset_id: current.asset_id || getId(assetItems[0]),
      }))
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : '合约列表加载失败')
      setContracts([])
      setAssets([])
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
      const created = await createContract({
        title: form.title,
        provider_id: Number(form.provider_id),
        consumer_id: Number(form.consumer_id),
        purpose: form.purpose,
        valid_from: form.valid_from || undefined,
        valid_until: form.valid_until || undefined,
        accessible_fields: form.accessible_fields,
        allowed_algorithms: form.allowed_algorithms.map((item) => item.toLowerCase().replace('-', '_')),
        privacy_budget_limit: form.privacy_budget_limit,
        status: form.status,
      })
      setShowForm(false)
      setFeedback({ tone: 'success', text: '合约已创建，可继续激活并执行授权评估。' })
      setForm({
        title: '',
        provider_id: '1',
        consumer_id: '2',
        purpose: '',
        valid_from: '',
        valid_until: '',
        accessible_fields: [],
        allowed_algorithms: [],
        privacy_budget_limit: 1.5,
        status: 'draft',
      })
      await load()
      setSelectedContract(created as Contract)
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
      setFeedback({ tone: 'success', text: '合约状态已更新为已生效，可立即用于授权评估。' })
      await load()
    } catch (err: unknown) {
      setFeedback({ tone: 'info', text: err instanceof Error ? err.message : '合约状态更新失败，请稍后重试。' })
    } finally {
      setActivating(null)
    }
  }

  const handleEvaluate = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthzError('')
    setAuthzLoading(true)
    try {
      let parsedAttrs: Record<string, unknown> = {}
      try {
        parsedAttrs = JSON.parse(authzForm.user_attrs)
      } catch {
        throw new Error('用户属性 JSON 格式不正确，请检查引号与括号。')
      }

      const assetId = Number(authzForm.asset_id)
      if (!Number.isFinite(assetId) || assetId <= 0) {
        throw new Error('请选择一个有效的数据资产。')
      }

      const result = await evaluateAuthz({
        user_id: Number(selectedContract?.consumer_id ?? form.consumer_id),
        asset_id: assetId,
        operation: authzForm.operation,
        context_attrs: {
          ...parsedAttrs,
          role: authzForm.user_role,
          username: safeString(selectedContract?.consumer, 'analyst（数据分析师）'),
          contract_id: safeString(selectedContract?.contract_id, '-'),
          contract_title: safeString(selectedContract?.title, '-'),
        },
      })

      setAuthzResult({
        ...result,
        matched_rule: result?.matched_policy_id ? `策略 #${result.matched_policy_id}` : '未命中显式策略',
        details: {
          asset: assets.find((item) => getId(item) === String(assetId))?.name ?? `资产 #${assetId}`,
          operation: OPERATION_OPTIONS.find((item) => item.value === authzForm.operation)?.label ?? authzForm.operation,
          contract: safeString(selectedContract?.title, '未选择合约'),
        },
      })
    } catch (err: unknown) {
      setAuthzError(err instanceof Error ? err.message : '评估失败')
      setAuthzResult(null)
    } finally {
      setAuthzLoading(false)
    }
  }

  const toggleField = (list: 'accessible_fields' | 'allowed_algorithms', val: string) => {
    setForm((current) => ({
      ...current,
      [list]: (current[list] as string[]).includes(val)
        ? (current[list] as string[]).filter((item) => item !== val)
        : [...(current[list] as string[]), val],
    }))
  }

  const contractList = toArray<Contract>(contracts)
  const selectedContractId = getId(selectedContract)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-tech">合约与授权</h1>
          <p className="text-slate-400 text-sm mt-0.5">管理共享协议、审批状态与 RBAC/ABAC 授权评估流程</p>
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

      {loadError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <div className="flex items-center justify-between gap-4">
            <span>{loadError}</span>
            <button onClick={load} className="underline underline-offset-2">重试</button>
          </div>
        </div>
      ) : null}

      {feedback ? (
        <div className={feedback.tone === 'success' ? 'alert-success' : 'alert-info'}>
          {feedback.text}
        </div>
      ) : null}

      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={(event) => event.target === event.currentTarget && setShowForm(false)}>
          <div className="card-glow w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 animate-slide-in">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-100">创建数据共享合约</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="form-label">合约标题</label>
                  <input className="form-input" required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="如：金融数据共享授权协议（风控分析）" />
                </div>
                <div>
                  <label className="form-label">数据提供方</label>
                  <select className="form-input" value={form.provider_id} onChange={(event) => setForm((current) => ({ ...current, provider_id: event.target.value }))}>
                    {PARTY_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">数据需求方</label>
                  <select className="form-input" value={form.consumer_id} onChange={(event) => setForm((current) => ({ ...current, consumer_id: event.target.value }))}>
                    {PARTY_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="form-label">使用目的</label>
                  <textarea className="form-input h-20 resize-none" value={form.purpose} onChange={(event) => setForm((current) => ({ ...current, purpose: event.target.value }))} placeholder="说明使用场景、输出范围、限制条件与合规要求。" />
                </div>
                <div>
                  <label className="form-label">生效开始日期</label>
                  <input type="date" className="form-input" value={form.valid_from} onChange={(event) => setForm((current) => ({ ...current, valid_from: event.target.value }))} />
                </div>
                <div>
                  <label className="form-label">到期日期</label>
                  <input type="date" className="form-input" value={form.valid_until} onChange={(event) => setForm((current) => ({ ...current, valid_until: event.target.value }))} />
                </div>
                <div>
                  <label className="form-label">初始状态</label>
                  <select className="form-input" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                    {Object.entries(CONTRACT_STATUS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">隐私预算上限：{form.privacy_budget_limit.toFixed(1)}</label>
                  <input type="range" min="0.5" max="5" step="0.1" value={form.privacy_budget_limit} onChange={(event) => setForm((current) => ({ ...current, privacy_budget_limit: Number(event.target.value) }))} className="w-full accent-blue-500 mt-2" />
                </div>
              </div>

              <div>
                <label className="form-label">可访问字段</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {FIELD_OPTIONS.map((item) => (
                    <button key={item} type="button" onClick={() => toggleField('accessible_fields', item)} className={`badge cursor-pointer ${form.accessible_fields.includes(item) ? 'badge-cyan' : 'badge-gray'}`}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="form-label">允许算法</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {ALGORITHMS_OPTIONS.map((item) => (
                    <button key={item} type="button" onClick={() => toggleField('allowed_algorithms', item)} className={`badge cursor-pointer ${form.allowed_algorithms.includes(item) ? 'badge-purple' : 'badge-gray'}`}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              {formError ? <p className="alert-error">{formError}</p> : null}

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
        <div className="xl:col-span-2 card-glow p-5">
          <h2 className="section-header">合约列表</h2>
          {loading ? (
            <LoadingSpinner message="加载合约..." className="py-10" />
          ) : contractList.length === 0 ? (
            <div className="text-center py-10">
              <FileText className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">暂无合约记录，可新建一份共享协议开始流通治理。</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>合约标题</th>
                    <th>提供方</th>
                    <th>需求方</th>
                    <th>用途</th>
                    <th>有效期</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {contractList.map((contract) => {
                    const status = safeString(contract.status, 'draft')
                    const statusInfo = CONTRACT_STATUS[status] ?? { label: status, cls: 'badge-gray' }
                    const contractId = getId(contract)
                    return (
                      <tr key={contractId} className={`cursor-pointer ${selectedContractId === contractId ? 'bg-blue-900/20' : ''}`} onClick={() => setSelectedContract(contract)}>
                        <td className="font-semibold text-slate-100 max-w-48 truncate">{safeString(contract.title, '-')}</td>
                        <td className="text-slate-400 text-xs max-w-28 truncate">{safeString(contract.provider, '-')}</td>
                        <td className="text-slate-400 text-xs max-w-28 truncate">{safeString(contract.consumer, '-')}</td>
                        <td className="text-slate-400 text-xs max-w-40 truncate">{safeString(contract.purpose, '-')}</td>
                        <td className="text-xs text-slate-400 whitespace-nowrap">
                          {contract.valid_from ? dayjs(contract.valid_from).format('YYYY-MM-DD') : '—'}
                          <br />
                          {contract.valid_until ? `至 ${dayjs(contract.valid_until).format('YYYY-MM-DD')}` : '长期'}
                        </td>
                        <td><span className={`badge ${statusInfo.cls}`}>{statusInfo.label}</span></td>
                        <td>
                          {status === 'draft' || status === 'pending' ? (
                            <button onClick={(event) => { event.stopPropagation(); handleActivate(contractId) }} disabled={activating === contractId} className="btn btn-success text-xs py-1 px-2 gap-1">
                              {activating === contractId ? <LoadingSpinner size="sm" /> : <Play className="w-3.5 h-3.5" />}
                              激活
                            </button>
                          ) : status === 'active' ? (
                            <span className="text-emerald-400 text-xs flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> 生效中
                            </span>
                          ) : (
                            <span className="text-slate-500 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card-glow p-4">
            {!selectedContract ? (
              <div className="text-center py-10">
                <ClipboardList className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 text-sm font-medium">选择一份合约查看详情</p>
                <p className="text-slate-500 text-xs mt-1">右侧将展示用途、预算、字段范围与当前授权状态。</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-100">合约详情</h3>
                  <button onClick={() => setSelectedContract(null)}><X className="w-4 h-4 text-slate-500" /></button>
                </div>
                <div className="space-y-2 text-sm">
                  {[
                    ['合约标题', selectedContract.title],
                    ['合约编号', safeString(selectedContract.contract_id, '-')],
                    ['提供方', selectedContract.provider],
                    ['需求方', selectedContract.consumer],
                    ['使用目的', selectedContract.purpose],
                    ['隐私预算', selectedContract.privacy_budget_limit != null ? String(selectedContract.privacy_budget_limit) : '-'],
                    ['生效周期', `${selectedContract.valid_from ? dayjs(selectedContract.valid_from).format('YYYY-MM-DD') : '—'} 至 ${selectedContract.valid_until ? dayjs(selectedContract.valid_until).format('YYYY-MM-DD') : '长期'}`],
                  ].map(([label, value]) => (
                    <div key={label} className="flex gap-2">
                      <span className="text-slate-500 w-20 flex-shrink-0">{label}</span>
                      <span className="text-slate-300 break-all">{value}</span>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <span className="text-slate-500 w-20">当前状态</span>
                    <span className={`badge ${CONTRACT_STATUS[safeString(selectedContract.status, 'draft')]?.cls ?? 'badge-gray'}`}>{CONTRACT_STATUS[safeString(selectedContract.status, 'draft')]?.label ?? safeString(selectedContract.status)}</span>
                  </div>
                </div>

                {selectedContract.contract_hash ? (
                  <div className="mt-4">
                    <p className="text-xs text-slate-500 mb-1">合约哈希</p>
                    <p className="hash-display">{selectedContract.contract_hash}</p>
                  </div>
                ) : null}

                <div className="mt-4">
                  <p className="text-xs text-slate-500 mb-1">可访问字段</p>
                  <div className="flex flex-wrap gap-1.5">
                    {toArray(selectedContract.accessible_fields).map((item) => <span key={item} className="badge badge-cyan text-xs">{item}</span>)}
                    {toArray(selectedContract.accessible_fields).length === 0 ? <span className="text-xs text-slate-500">未配置字段范围</span> : null}
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-xs text-slate-500 mb-1">允许算法</p>
                  <div className="flex flex-wrap gap-1.5">
                    {toArray(selectedContract.allowed_algorithms).map((item) => <span key={item} className="badge badge-purple text-xs">{item}</span>)}
                    {toArray(selectedContract.allowed_algorithms).length === 0 ? <span className="text-xs text-slate-500">未配置算法范围</span> : null}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="card-glow p-4">
            <h3 className="section-header text-sm">RBAC / ABAC 授权评估</h3>
            <form onSubmit={handleEvaluate} className="space-y-3">
              <div>
                <label className="form-label">用户角色</label>
                <select className="form-input" value={authzForm.user_role} onChange={(event) => setAuthzForm((current) => ({ ...current, user_role: event.target.value }))}>
                  {ROLE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">用户属性（JSON）</label>
                <textarea className="form-input h-20 resize-none font-mono text-xs" value={authzForm.user_attrs} onChange={(event) => setAuthzForm((current) => ({ ...current, user_attrs: event.target.value }))} placeholder='{"dept":"联合风控中心","clearance":"level-2","purpose":"风控分析"}' />
              </div>
              <div>
                <label className="form-label">资产选择</label>
                <select className="form-input" value={authzForm.asset_id} onChange={(event) => setAuthzForm((current) => ({ ...current, asset_id: event.target.value }))}>
                  <option value="">请选择资产</option>
                  {assets.map((asset) => <option key={getId(asset)} value={getId(asset)}>{safeString(asset.name, '未命名资产')}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">操作类型</label>
                <select className="form-input" value={authzForm.operation} onChange={(event) => setAuthzForm((current) => ({ ...current, operation: event.target.value }))}>
                  {OPERATION_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
              {authzError ? <p className="alert-error text-xs">{authzError}</p> : null}
              <button type="submit" disabled={authzLoading} className="btn btn-primary w-full gap-2 justify-center">
                {authzLoading ? <LoadingSpinner size="sm" /> : <ShieldCheck className="w-4 h-4" />}
                {authzLoading ? '评估中...' : '评估授权'}
              </button>
            </form>

            {authzResult ? (
              <div className={`mt-4 p-3 rounded-lg ${authzResult.allowed ? 'alert-success' : 'alert-error'}`}>
                <div className="flex items-center gap-2 font-bold">
                  {authzResult.allowed ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
                  <span>{authzResult.allowed ? '授权通过' : '授权拒绝'}</span>
                </div>
                <p className="mt-2 text-xs opacity-90">{safeString(authzResult.reason, '未返回评估说明')}</p>
                <p className="mt-1 text-xs opacity-75">匹配规则：{safeString(authzResult.matched_rule, '未命中')}</p>
                {authzResult.details ? (
                  <div className="mt-3 border-t border-current/20 pt-2 space-y-1">
                    {Object.entries(authzResult.details).map(([key, value]) => (
                      <div key={key} className="text-xs flex gap-2">
                        <span className="opacity-70">{key}：</span>
                        <span className="font-mono">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {contractList.length > 0 ? (
        <div className="card-glow p-5">
          <h2 className="section-header">合约状态统计</h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(CONTRACT_STATUS).map(([status, info]) => (
              <div key={status} className={`badge ${info.cls} text-sm px-4 py-2`}>
                {info.label}：{contractList.filter((item) => safeString(item.status) === status).length}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
