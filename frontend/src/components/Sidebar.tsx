import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Database,
  FileText,
  FlaskConical,
  Lock,
  Brain,
  AlertTriangle,
  ScrollText,
  Theater,
} from 'lucide-react'

const navItems = [
  { path: '/',          icon: LayoutDashboard, label: '总览驾驶舱' },
  { path: '/assets',    icon: Database,        label: '数据资产登记' },
  { path: '/contracts', icon: FileText,        label: '合约与授权' },
  { path: '/privacy',   icon: FlaskConical,    label: '隐私计算实验室' },
  { path: '/vpcs',      icon: Lock,            label: '加密路径查询VPCS' },
  { path: '/zkgcn',     icon: Brain,           label: '可验证推理zkGCN' },
  { path: '/risks',     icon: AlertTriangle,   label: '风险监控预警' },
  { path: '/audit',     icon: ScrollText,      label: '审计追踪' },
  { path: '/scenarios', icon: Theater,         label: '行业场景演示' },
]

export default function Sidebar() {
  return (
    <aside
      className="flex flex-col py-3 gap-0.5 overflow-y-auto"
      style={{ background: '#090d1a', borderRight: '1px solid #1e293b' }}
    >
      {navItems.map(({ path, icon: Icon, label }) => (
        <NavLink
          key={path}
          to={path}
          end={path === '/'}
          className={({ isActive }) =>
            [
              'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm font-medium transition-all duration-200 group',
              isActive
                ? 'bg-gradient-to-r from-blue-900/60 to-blue-800/30 text-blue-300 border border-blue-700/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                className={`w-4 h-4 flex-shrink-0 ${
                  isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'
                }`}
              />
              <span className="truncate">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </aside>
  )
}
