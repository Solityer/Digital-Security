import client from './client'

// ─── Health ─────────────────────────────────────────────────────────────────
export const getHealth = () =>
  client.get('/health').then((r) => r.data)

// ─── Data Assets ─────────────────────────────────────────────────────────────
export const getAssets = () =>
  client.get('/api/assets').then((r) => r.data)

export const createAsset = (data: Record<string, unknown>) =>
  client.post('/api/assets', data).then((r) => r.data)

export const getAsset = (id: string) =>
  client.get(`/api/assets/${id}`).then((r) => r.data)

export const generateAssetGraph = (id: string) =>
  client.post(`/api/assets/${id}/graph/generate`).then((r) => r.data)

// ─── Contracts ───────────────────────────────────────────────────────────────
export const getContracts = () =>
  client.get('/api/contracts').then((r) => r.data)

export const createContract = (data: Record<string, unknown>) =>
  client.post('/api/contracts', data).then((r) => r.data)

export const activateContract = (id: string) =>
  client.post(`/api/contracts/${id}/activate`).then((r) => r.data)

export const evaluateAuthz = (data: Record<string, unknown>) =>
  client.post('/api/authz/evaluate', data).then((r) => r.data)

// ─── Audit ────────────────────────────────────────────────────────────────────
export const getAuditLogs = (params?: Record<string, unknown>) =>
  client.get('/api/audit/logs', { params }).then((r) => r.data)

export const verifyAuditChain = () =>
  client.post('/api/audit/verify-chain').then((r) => r.data)

export const tamperAuditDemo = (logId: string) =>
  client.post('/api/audit/tamper-demo', { log_id: logId ? Number(logId) : null }).then((r) => r.data)

// ─── Privacy Lab – DP algorithms ─────────────────────────────────────────────
export const runGraphSDP = (data: Record<string, unknown>) =>
  client.post('/api/privacy/graph-sdp', data).then((r) => r.data)

export const runGCCSDP = (data: Record<string, unknown>) =>
  client.post('/api/privacy/gcc-sdp', data).then((r) => r.data)

export const runGSLDP = (data: Record<string, unknown>) =>
  client.post('/api/privacy/gs-ldp', data).then((r) => r.data)

export const runNDKD = (data: Record<string, unknown>) =>
  client.post('/api/privacy/ndkd', data).then((r) => r.data)

// ─── VPCS ─────────────────────────────────────────────────────────────────────
export const runVPCSQuery = (data: Record<string, unknown>) =>
  client.post('/api/vpcs/query', data).then((r) => r.data)

export const runVPCSTamper = (data: Record<string, unknown>) =>
  client.post('/api/vpcs/tamper-demo', data).then((r) => r.data)

// ─── zkGCN ───────────────────────────────────────────────────────────────────
export const runZKGCN = (data: Record<string, unknown>) =>
  client.post('/api/zkgcn/infer', data).then((r) => r.data)

export const runZKGCNTamper = (data: Record<string, unknown>) =>
  client.post('/api/zkgcn/tamper-demo', data).then((r) => r.data)

// ─── Risk ─────────────────────────────────────────────────────────────────────
export const getRisks = () =>
  client.get('/api/risks').then((r) => r.data)

export const evaluateRisk = (data: Record<string, unknown>) =>
  client.post('/api/risks/evaluate', data).then((r) => r.data)

export const getRiskReport = () =>
  client.get('/api/risks/report').then((r) => r.data)

// ─── Scenarios ────────────────────────────────────────────────────────────────
export const getDemoScenarios = () =>
  client.get('/api/demo/scenarios').then((r) => r.data)

export const runDemoScenario = (scenario: string) =>
  client.post(`/api/demo/run/${scenario}`).then((r) => r.data)
