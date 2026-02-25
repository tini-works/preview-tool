import { useCallback, useRef, type ReactNode } from 'react'
import { useDevToolsStore } from '@/devtools/useDevToolsStore'
import { useFlowConfig } from '@/flow/useFlowConfig'
import { findAction } from '@/flow/FlowEngine'
import { resolveTrigger } from '@/flow/trigger-matcher'

interface FlowProviderProps {
  children: ReactNode
}

export function FlowProvider({ children }: FlowProviderProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const playMode = useDevToolsStore((s) => s.playMode)
  const selectedRoute = useDevToolsStore((s) => s.selectedRoute)
  const setSelectedRoute = useDevToolsStore((s) => s.setSelectedRoute)
  const setSelectedState = useDevToolsStore((s) => s.setSelectedState)
  const pushFlowHistory = useDevToolsStore((s) => s.pushFlowHistory)

  const flowConfig = useFlowConfig(selectedRoute)

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!playMode || !flowConfig || !selectedRoute) return
      if (!containerRef.current) return

      const trigger = resolveTrigger(e.target, containerRef.current)
      if (!trigger) return

      const action = findAction(flowConfig, selectedRoute, trigger)
      if (!action) return

      e.preventDefault()
      e.stopPropagation()

      // Push current position to history before navigating
      const currentState = useDevToolsStore.getState().selectedState

      if (action.setState && !action.navigate) {
        pushFlowHistory(selectedRoute, currentState)
        setSelectedState(action.setState)
      }

      if (action.navigate) {
        pushFlowHistory(selectedRoute, currentState)
        setSelectedRoute(action.navigate)
        if (action.navigateState) {
          // Small delay to let route change propagate before setting state
          queueMicrotask(() => {
            setSelectedState(action.navigateState!)
          })
        }
      }
    },
    [playMode, flowConfig, selectedRoute, setSelectedRoute, setSelectedState, pushFlowHistory]
  )

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className={playMode && flowConfig ? 'cursor-pointer' : undefined}
    >
      {children}
    </div>
  )
}
