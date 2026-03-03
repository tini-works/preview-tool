import { useCallback, useRef, type ReactNode } from 'react'
import { useDevToolsStore } from '../store/useDevToolsStore.ts'
import { getFlowActions } from './FlowRegistry.ts'
import type { AnyFlowAction } from './FlowRegistry.ts'
import { resolveTrigger, matchComponentTrigger } from './trigger-matcher.ts'
import { getScreenEntries } from '../ScreenRegistry.ts'
import type { RegionsMap, FlowAction, FlowActionV2 } from '../types.ts'

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

function isV2Action(action: AnyFlowAction): action is FlowActionV2 {
  return typeof action.trigger === 'object' && action.trigger !== null
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

      // Split actions by type
      const v1Actions = actions.filter((a): a is FlowAction => typeof a.trigger === 'string')
      const v2Actions = actions.filter(isV2Action)

      // Try V2 (ComponentTrigger) matching first
      let matchedAction: AnyFlowAction | undefined
      if (v2Actions.length > 0) {
        const triggers = v2Actions.map((a) => a.trigger)
        const matched = matchComponentTrigger(e.target, containerRef.current, triggers)
        if (matched) {
          matchedAction = v2Actions.find((a) => a.trigger === matched)
        }
      }

      // Fall back to V1 (data-flow-target) matching
      if (!matchedAction && v1Actions.length > 0) {
        const triggerStr = resolveTrigger(e.target, containerRef.current)
        if (triggerStr) {
          matchedAction = v1Actions.find((a) => a.trigger === triggerStr)
        }
      }

      if (!matchedAction) return

      e.preventDefault()
      e.stopPropagation()

      // V1 setState (no navigation) -- change state on current screen
      if ('setState' in matchedAction && matchedAction.setState && !matchedAction.navigate) {
        pushFlowHistory(selectedRoute)

        const currentEntry = modules.find((m) => m.route === selectedRoute)
        const regions = currentEntry?.regions
        if (regions) {
          const regionKey = findRegionForState(regions, matchedAction.setState)
          if (regionKey) {
            setRegionState(regionKey, matchedAction.setState)
          }
        }
      }

      // setRegionState (explicit region targeting, no navigation)
      if (matchedAction.setRegionState && !matchedAction.navigate) {
        pushFlowHistory(selectedRoute)
        setRegionState(matchedAction.setRegionState.region, matchedAction.setRegionState.state)
      }

      // navigate -- go to another screen
      if (matchedAction.navigate) {
        pushFlowHistory(selectedRoute)
        navigateFlow(matchedAction.navigate)

        // If target screen uses regions and navigateState is set,
        // resolve which region contains the state and set it
        if (matchedAction.navigateState) {
          const targetEntry = modules.find((m) => m.route === matchedAction.navigate)
          const targetRegions = targetEntry?.regions
          if (targetRegions) {
            const regionKey = findRegionForState(targetRegions, matchedAction.navigateState)
            if (regionKey) {
              setRegionState(regionKey, matchedAction.navigateState)
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
