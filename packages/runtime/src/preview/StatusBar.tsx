import { cn } from '../lib/utils.ts'
import type { OsMode } from '../store/useDevToolsStore.ts'

interface StatusBarProps {
  osMode: OsMode
  height: number
  showDynamicIsland?: boolean
}

function TimeDisplay({ className }: { className?: string }) {
  const time = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return <span className={className}>{time}</span>
}

function SignalBars({ className }: { className?: string }) {
  return (
    <svg width="17" height="12" viewBox="0 0 17 12" className={className}>
      <rect x="0" y="9" width="3" height="3" rx="0.5" fill="currentColor" />
      <rect x="4.5" y="6" width="3" height="6" rx="0.5" fill="currentColor" />
      <rect x="9" y="3" width="3" height="9" rx="0.5" fill="currentColor" />
      <rect x="13.5" y="0" width="3" height="12" rx="0.5" fill="currentColor" />
    </svg>
  )
}

function WifiIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" className={className}>
      <path d="M8 11.5a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5z" fill="currentColor" />
      <path d="M4.93 7.57a4.5 4.5 0 016.14 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M2.1 4.73a8 8 0 0111.8 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function BatteryIcon({ className }: { className?: string }) {
  return (
    <svg width="28" height="12" viewBox="0 0 28 12" className={className}>
      <rect x="0.5" y="0.5" width="23" height="11" rx="2" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.35" />
      <rect x="24.5" y="3.5" width="2" height="5" rx="1" fill="currentColor" opacity="0.35" />
      <rect x="2" y="2" width="20" height="8" rx="1" fill="currentColor" />
    </svg>
  )
}

export function StatusBar({ osMode, height, showDynamicIsland = false }: StatusBarProps) {
  const isDark = osMode === 'dark'

  return (
    <div
      className={cn(
        'flex shrink-0 items-end justify-between px-6 pb-1',
        isDark ? 'text-white' : 'text-black'
      )}
      style={{ height }}
    >
      <TimeDisplay className="text-[15px] font-semibold leading-none" />

      {showDynamicIsland && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 h-[37px] w-[126px] rounded-full bg-black" />
      )}

      <div className="flex items-center gap-1.5">
        <SignalBars />
        <WifiIcon />
        <BatteryIcon />
      </div>
    </div>
  )
}
