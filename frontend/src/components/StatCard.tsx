import { ReactNode } from 'react'
import clsx from 'clsx'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

type ColorVariant = 'blue' | 'cyan' | 'green' | 'yellow' | 'red' | 'purple' | 'orange'
type Trend = 'up' | 'down' | 'neutral'

interface StatCardProps {
  icon?: ReactNode
  title: string
  value: string | number
  subtitle?: string
  trend?: Trend
  trendValue?: string
  color?: ColorVariant
  className?: string
  loading?: boolean
}

const colorMap: Record<ColorVariant, { bg: string; border: string; iconBg: string; text: string }> = {
  blue:   { bg: 'rgba(30,58,138,0.15)',  border: 'rgba(59,130,246,0.3)',   iconBg: 'rgba(30,58,138,0.4)',  text: '#60a5fa' },
  cyan:   { bg: 'rgba(14,79,92,0.15)',   border: 'rgba(8,145,178,0.3)',    iconBg: 'rgba(14,79,92,0.4)',   text: '#22d3ee' },
  green:  { bg: 'rgba(6,78,59,0.15)',    border: 'rgba(5,150,105,0.3)',    iconBg: 'rgba(6,78,59,0.4)',    text: '#34d399' },
  yellow: { bg: 'rgba(120,53,15,0.15)',  border: 'rgba(245,158,11,0.3)',   iconBg: 'rgba(120,53,15,0.4)',  text: '#fbbf24' },
  red:    { bg: 'rgba(127,29,29,0.15)',  border: 'rgba(239,68,68,0.3)',    iconBg: 'rgba(127,29,29,0.4)',  text: '#f87171' },
  purple: { bg: 'rgba(88,28,135,0.15)',  border: 'rgba(167,139,250,0.3)',  iconBg: 'rgba(88,28,135,0.4)',  text: '#a78bfa' },
  orange: { bg: 'rgba(124,45,18,0.15)',  border: 'rgba(249,115,22,0.3)',   iconBg: 'rgba(124,45,18,0.4)',  text: '#fb923c' },
}

export default function StatCard({
  icon,
  title,
  value,
  subtitle,
  trend,
  trendValue,
  color = 'blue',
  className,
  loading = false,
}: StatCardProps) {
  const c = colorMap[color]

  return (
    <div
      className={clsx('rounded-xl p-5 relative overflow-hidden transition-all duration-300 hover:scale-[1.02]', className)}
      style={{
        background: `linear-gradient(135deg, ${c.bg}, rgba(15,23,42,0.9))`,
        border: `1px solid ${c.border}`,
        boxShadow: `0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}
    >
      {/* Background decoration */}
      <div
        className="absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-10"
        style={{ background: c.text, filter: 'blur(20px)' }}
      />

      <div className="relative flex items-start gap-4">
        {icon && (
          <div
            className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: c.iconBg, color: c.text }}
          >
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider truncate">
            {title}
          </p>
          {loading ? (
            <div className="mt-1.5 h-7 w-20 bg-slate-700 animate-pulse rounded" />
          ) : (
            <p
              className="mt-0.5 text-2xl font-black leading-tight"
              style={{ color: c.text }}
            >
              {value}
            </p>
          )}
          {subtitle && (
            <p className="mt-1 text-xs text-slate-500 truncate">{subtitle}</p>
          )}
          {trend && trendValue && (
            <div className="mt-1.5 flex items-center gap-1 text-xs">
              {trend === 'up' && <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}
              {trend === 'down' && <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
              {trend === 'neutral' && <Minus className="w-3.5 h-3.5 text-slate-400" />}
              <span
                className={clsx(
                  'font-medium',
                  trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-slate-400'
                )}
              >
                {trendValue}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
