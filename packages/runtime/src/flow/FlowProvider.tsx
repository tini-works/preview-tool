import { useCallback, useRef, type ReactNode } from 'react'
import { useDevToolsStore } from '../store/useDevToolsStore.ts'
import { getFlowActions } from './FlowRegistry.ts'
import { resolveTrigger } from './trigger-matcher.ts'
import { getScreenEntries } from '../ScreenRegistry.ts'
import type { RegionsMap } from '../types.ts'

interface FlowProviderProps {
  children: ReactNode
}

/**
 * Find which region contains a given state key.
 * Returns the region key if found, null otherwise.
 */
function findRegionForState(
  regions: RegionsMap,
  stateKey: string
): string | null {
  for (const [regionKey, region] of Object.entries(regions)) {
    if (stateKey in region.states) return regionKey
  }
  return null
}

export function FlowProvider({ children }: FlowProviderProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedRoute = useDevToolsStore((s) => s.selectedRoute)
  const pushFlowHistory = useDevToolsStore((s) => s.pushFlowHistory)
  const navigateFlow = useDevToolsStore((s) => s.navigateFlow)
  const setRegionState = useDevToolsStore((s) => s.setRegionState)

  const actions = selectedRoute ? getFlowActions(selectedRoute) : null
  const modules = getScreenEntries()

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!actions || !selectedRoute) return
      if (!containerRef.current) return

      const trigger = resolveTrigger(e.target, containerRef.current)
      if (!trigger) return

      const action = actions.find((a) => a.trigger === trigger)
      if (!action) return

      e.preventDefault()
      e.stopPropagation()

      // setState (no navigation) -- change state on current screen
      if (action.setState && !action.navigate) {
        pushFlowHistory(selectedRoute)

        const currentEntry = modules.find((m) => m.route === selectedRoute)
        const regions = currentEntry?.regions
        if (regions) {
          const regionKey = findRegionForState(regions, action.setState)
          if (regionKey) {
            setRegionState(regionKey, action.setState)
          }
        }
      }

      // setRegionState (explicit region targeting, no navigation)
      if (action.setRegionState && !action.navigate) {
        pushFlowHistory(selectedRoute)
        setRegionState(action.setRegionState.region, action.setRegionState.state)
      }

      // navigate -- go to another screen
      if (action.navigate) {
        pushFlowHistory(selectedRoute)
        navigateFlow(action.navigate)

        // If target screen uses regions and navigateState is set,
        // resolve which region contains the state and set it
        if (action.navigateState) {
          const targetEntry = modules.find((m) => m.route === action.navigate)
          const targetRegions = targetEntry?.regions
          if (targetRegions) {
            const regionKey = findRegionForState(targetRegions, action.navigateState)
            if (regionKey) {
              setRegionState(regionKey, action.navigateState)
            }
          }
        }
      }
    },
    [actions, selectedRoute, modules, pushFlowHistory, navigateFlow, setRegionState]
  )

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className={actions ? 'cursor-pointer' : undefined}
    >
      {children}
    </div>
  )
}
