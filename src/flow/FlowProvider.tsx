import { useCallback, useRef, type ReactNode } from 'react'
import { useDevToolsStore } from '@/devtools/useDevToolsStore'
import { useFlowActions } from '@/flow/useFlowConfig'
import { resolveTrigger } from '@/flow/trigger-matcher'

interface FlowProviderProps {
  children: ReactNode
}

export function FlowProvider({ children }: FlowProviderProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const playMode = useDevToolsStore((s) => s.playMode)
  const selectedRoute = useDevToolsStore((s) => s.selectedRoute)
  const setSelectedState = useDevToolsStore((s) => s.setSelectedState)
  const pushFlowHistory = useDevToolsStore((s) => s.pushFlowHistory)
  const navigateFlow = useDevToolsStore((s) => s.navigateFlow)

  const actions = useFlowActions(selectedRoute)

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!playMode || !actions || !selectedRoute) return
      if (!containerRef.current) return

      const trigger = resolveTrigger(e.target, containerRef.current)
      if (!trigger) return

      const action = actions.find((a) => a.trigger === trigger)
      if (!action) return

      e.preventDefault()
      e.stopPropagation()

      const currentState = useDevToolsStore.getState().selectedState

      if (action.setState && !action.navigate) {
        pushFlowHistory(selectedRoute, currentState)
        setSelectedState(action.setState)
      }

      if (action.navigate) {
        pushFlowHistory(selectedRoute, currentState)
        navigateFlow(action.navigate, action.navigateState ?? null)
      }
    },
    [playMode, actions, selectedRoute, setSelectedState, pushFlowHistory, navigateFlow]
  )

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className={playMode && actions ? 'cursor-pointer' : undefined}
    >
      {children}
    </div>
  )
}
