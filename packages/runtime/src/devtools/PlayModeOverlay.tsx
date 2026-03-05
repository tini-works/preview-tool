import { RotateCcw } from 'lucide-react'
import { useDevToolsStore } from '../store/useDevToolsStore.ts'

export function ResetOverlay() {
  const resetRegions = useDevToolsStore((s) => s.resetRegions)
  const resetFlowHistory = useDevToolsStore((s) => s.resetFlowHistory)

  const handleReset = () => {
    resetRegions()
    resetFlowHistory()
  }

  return (
    <button
      onClick={handleReset}
      className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 rounded-full bg-charcoal-500 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-charcoal-400"
      title="Reset all screens to default state"
    >
      <RotateCcw className="size-3.5" />
      Reset
    </button>
  )
}
