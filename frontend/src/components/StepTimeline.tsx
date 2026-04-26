import clsx from 'clsx'
import { CheckCircle, Circle, Clock, AlertCircle, Loader } from 'lucide-react'

export type StepStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped'

export interface Step {
  id: string
  label: string
  description?: string
  status: StepStatus
  detail?: string
  timestamp?: string
}

interface StepTimelineProps {
  steps: Step[]
  orientation?: 'vertical' | 'horizontal'
  className?: string
}

const statusIcon: Record<StepStatus, React.ReactNode> = {
  pending: <Circle className="w-4 h-4 text-slate-500" />,
  running: <Loader className="w-4 h-4 text-blue-400 animate-spin" />,
  success: <CheckCircle className="w-4 h-4 text-emerald-400" />,
  error:   <AlertCircle className="w-4 h-4 text-red-400" />,
  skipped: <Clock className="w-4 h-4 text-slate-500" />,
}

const statusColor: Record<StepStatus, string> = {
  pending: 'border-slate-700 bg-slate-800/50',
  running: 'border-blue-500 bg-blue-900/30',
  success: 'border-emerald-600/60 bg-emerald-900/20',
  error:   'border-red-600/60 bg-red-900/20',
  skipped: 'border-slate-700 bg-slate-800/30',
}

const statusText: Record<StepStatus, string> = {
  pending: 'text-slate-500',
  running: 'text-blue-300',
  success: 'text-emerald-300',
  error:   'text-red-300',
  skipped: 'text-slate-500',
}

export default function StepTimeline({ steps, orientation = 'vertical', className }: StepTimelineProps) {
  if (orientation === 'horizontal') {
    return (
      <div className={clsx('flex items-start gap-0', className)}>
        {steps.map((step, idx) => (
          <div key={step.id} className="flex flex-col items-center flex-1 relative">
            {/* Connector line (before) */}
            {idx > 0 && (
              <div
                className={clsx(
                  'absolute top-4 right-1/2 w-full h-0.5',
                  step.status === 'success' ? 'bg-emerald-600/60' :
                  step.status === 'running' ? 'bg-blue-600/60' : 'bg-slate-700'
                )}
              />
            )}
            {/* Icon */}
            <div
              className={clsx(
                'w-8 h-8 rounded-full border flex items-center justify-center z-10',
                statusColor[step.status]
              )}
            >
              {statusIcon[step.status]}
            </div>
            {/* Label */}
            <div className="mt-2 text-center px-1">
              <p className={clsx('text-xs font-semibold', statusText[step.status])}>
                {step.label}
              </p>
              {step.description && (
                <p className="text-xs text-slate-600 mt-0.5">{step.description}</p>
              )}
              {step.timestamp && (
                <p className="text-xs text-slate-600 mt-0.5 font-mono">{step.timestamp}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={clsx('flex flex-col gap-0', className)}>
      {steps.map((step, idx) => (
        <div key={step.id} className="flex gap-3">
          {/* Left column: icon + line */}
          <div className="flex flex-col items-center">
            <div
              className={clsx(
                'w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0',
                statusColor[step.status]
              )}
            >
              {statusIcon[step.status]}
            </div>
            {idx < steps.length - 1 && (
              <div
                className={clsx(
                  'w-0.5 flex-1 my-1 min-h-4',
                  step.status === 'success' ? 'bg-emerald-700/50' :
                  step.status === 'running' ? 'bg-blue-700/50' : 'bg-slate-700'
                )}
              />
            )}
          </div>

          {/* Content */}
          <div className={clsx('pb-4 flex-1', idx === steps.length - 1 && 'pb-0')}>
            <div className={clsx('flex items-center justify-between')}>
              <p className={clsx('text-sm font-semibold', statusText[step.status])}>
                {step.label}
              </p>
              {step.timestamp && (
                <span className="text-xs text-slate-600 font-mono">{step.timestamp}</span>
              )}
            </div>
            {step.description && (
              <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>
            )}
            {step.detail && (
              <div className="mt-1.5 bg-slate-800/50 rounded px-2 py-1">
                <p className="text-xs text-slate-400 font-mono break-all">{step.detail}</p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
