import { useEffect, useState, type ReactNode } from 'react'
import { WifiOff, Loader2 } from 'lucide-react'
import { useDevToolsStore } from '../store/useDevToolsStore.ts'

interface NetworkSimulationLayerProps {
  children: ReactNode
}

export function NetworkSimulationLayer({ children }: NetworkSimulationLayerProps) {
  const networkMode = useDevToolsStore((s) => s.networkMode)

  if (networkMode === 'offline') {
    return <OfflineScreen />
  }

  if (networkMode === 'slow-3g') {
    return <SlowNetworkWrapper>{children}</SlowNetworkWrapper>
  }

  return <>{children}</>
}

function OfflineScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-cream-50 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-coral-100">
        <WifiOff className="size-6 text-coral-600" />
      </div>
      <h2 className="text-lg font-semibold text-charcoal-500">No Connection</h2>
      <p className="max-w-xs text-sm text-slate-500">
        You appear to be offline. Check your connection and try again.
      </p>
    </div>
  )
}

function SlowNetworkWrapper({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(false)
    const timer = setTimeout(() => setReady(true), 2000)
    return () => clearTimeout(timer)
  }, [])

  if (!ready) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-cream-50 p-8 text-center">
        <Loader2 className="size-6 animate-spin text-teal-500" />
        <p className="text-sm text-slate-500">Loading on slow connection...</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center gap-1.5 bg-teal-50 px-3 py-1">
        <div className="size-1.5 rounded-full bg-teal-500" />
        <span className="text-xs text-teal-700">Slow 3G</span>
      </div>
      {children}
    </>
  )
}
