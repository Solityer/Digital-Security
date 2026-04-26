interface LoadingSpinnerProps {
  message?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = {
  sm: { outer: 'w-6 h-6',  inner: 'w-4 h-4',  text: 'text-xs' },
  md: { outer: 'w-10 h-10', inner: 'w-7 h-7',  text: 'text-sm' },
  lg: { outer: 'w-16 h-16', inner: 'w-11 h-11', text: 'text-base' },
}

export default function LoadingSpinner({ message, size = 'md', className = '' }: LoadingSpinnerProps) {
  const s = sizeMap[size]
  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <div className={`relative ${s.outer}`}>
        {/* Outer spinning ring */}
        <div
          className={`absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 border-r-blue-500/30 animate-spin`}
        />
        {/* Inner spinning ring (opposite) */}
        <div
          className={`absolute inset-1 rounded-full border-2 border-transparent border-b-cyan-400 border-l-cyan-400/30`}
          style={{ animation: 'spin 1.4s linear infinite reverse' }}
        />
        {/* Core dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={`${s.inner === 'w-4 h-4' ? 'w-2 h-2' : s.inner === 'w-7 h-7' ? 'w-3 h-3' : 'w-4 h-4'} rounded-full bg-blue-500`}
            style={{ boxShadow: '0 0 8px rgba(59,130,246,0.8)' }}
          />
        </div>
      </div>
      {message && (
        <p className={`text-slate-400 ${s.text} animate-pulse`}>{message}</p>
      )}
    </div>
  )
}

export function FullPageLoading({ message = '加载中...' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center min-h-64">
      <LoadingSpinner message={message} size="lg" />
    </div>
  )
}

export function InlineLoading({ message }: { message?: string }) {
  return <LoadingSpinner message={message} size="sm" className="py-2" />
}
