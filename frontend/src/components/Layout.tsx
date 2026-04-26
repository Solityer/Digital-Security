import { ReactNode } from 'react'
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
  Shield,
  Activity,
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

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="flex flex-col h-screen bg-bg-dark overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header
        className="flex-shrink-0 flex items-center justify-between px-6 h-14 z-50"
        style={{
          background: 'linear-gradient(90deg, #0a0e1a 0%, #0d1a3a 50%, #0a0e1a 100%)',
          borderBottom: '1px solid #1e293b',
          boxShadow: '0 1px 20px rgba(30,64,175,0.15)',
        }}
      >
        {/* Logo + title */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Shield
              className="w-8 h-8"
              style={{ color: '#3b82f6', filter: 'drop-shadow(0 0 6px rgba(59,130,246,0.6))' }}
            />
            <Activity
              className="w-4 h-4 absolute -bottom-1 -right-1"
              style={{ color: '#22d3ee' }}
            />
          </div>
          <div>
            <span
              className="text-xl font-black tracking-wider text-tech"
              style={{ letterSpacing: '0.15em' }}
            >
              数智安行
            </span>
            <span className="text-slate-400 text-sm ml-3 hidden sm:inline">
              图数据可信治理与智能流通平台
            </span>
          </div>
        </div>

        {/* Status indicators */}
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-4 text-xs text-slate-400">
            <span>v1.0.0</span>
            <span className="text-slate-600">|</span>
            <span>赛题竞赛演示版</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <span className="text-emerald-400 text-xs font-medium">系统运行中</span>
          </div>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className="flex-shrink-0 w-56 flex flex-col py-3 gap-0.5 overflow-y-auto"
          style={{
            background: '#090d1a',
            borderRight: '1px solid #1e293b',
          }}
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
                    ? 'bg-gradient-to-r from-blue-900/60 to-blue-800/30 text-blue-300 border border-blue-700/40 shadow-lg'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`w-4 h-4 flex-shrink-0 transition-colors ${
                      isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'
                    }`}
                  />
                  <span className="truncate">{label}</span>
                  {isActive && (
                    <span
                      className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400"
                      style={{ boxShadow: '0 0 6px rgba(96,165,250,0.8)' }}
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}

          {/* Sidebar footer */}
          <div className="mt-auto pt-4 px-4 pb-2">
            <div className="divider" />
            <p className="text-xs text-slate-600 text-center leading-5">
              数智安行平台
              <br />
              图数据可信治理
            </p>
          </div>
        </aside>

        {/* Main content */}
        <main
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{ background: '#0a0e1a' }}
        >
          <div className="min-h-full p-6">
            {children}
          </div>
        </main>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer
        className="flex-shrink-0 flex items-center justify-center h-8 text-xs text-slate-600"
        style={{ borderTop: '1px solid #1e293b', background: '#090d1a' }}
      >
        数智安行平台 | 图数据可信治理与智能流通 &nbsp;©&nbsp; 2025
      </footer>
    </div>
  )
}
