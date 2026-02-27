import { RotateCcw, X } from 'lucide-react'
import { useDevToolsStore } from '../store/useDevToolsStore.ts'

export function PlayModeOverlay() {
  const togglePlayMode = useDevToolsStore((s) => s.togglePlayMode)
  const resetRegions = useDevToolsStore((s) => s.resetRegions)
  const resetFlowHistory = useDevToolsStore((s) => s.resetFlowHistory)

  const handleReset = () => {
    resetRegions()
    resetFlowHistory()
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex gap-2">
      <button
        onClick={handleReset}
        className="flex items-center gap-1.5 rounded-full bg-charcoal-500 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-charcoal-400"
        title="Reset all screens to default state"
      >
        <RotateCcw className="size-3.5" />
        Reset
      </button>
      <button
        onClick={togglePlayMode}
        className="flex items-center justify-center rounded-full bg-charcoal-500 p-1.5 text-white shadow-lg hover:bg-charcoal-400"
        title="Exit play mode"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
