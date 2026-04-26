import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import DataAssets from './pages/DataAssets'
import Contracts from './pages/Contracts'
import PrivacyLab from './pages/PrivacyLab'
import VPCSQuery from './pages/VPCSQuery'
import ZKGCNPage from './pages/ZKGCNPage'
import RiskMonitor from './pages/RiskMonitor'
import AuditTrail from './pages/AuditTrail'
import ScenarioDemo from './pages/ScenarioDemo'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/"          element={<Dashboard />} />
        <Route path="/assets"    element={<DataAssets />} />
        <Route path="/contracts" element={<Contracts />} />
        <Route path="/privacy"   element={<PrivacyLab />} />
        <Route path="/vpcs"      element={<VPCSQuery />} />
        <Route path="/zkgcn"     element={<ZKGCNPage />} />
        <Route path="/risks"     element={<RiskMonitor />} />
        <Route path="/audit"     element={<AuditTrail />} />
        <Route path="/scenarios" element={<ScenarioDemo />} />
      </Routes>
    </Layout>
  )
}
