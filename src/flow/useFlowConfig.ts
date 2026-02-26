import { useMemo } from 'react'
import { parseFlowConfig, type FlowConfig } from '@/flow/FlowEngine'

const flowFiles = import.meta.glob<string>(
  '/src/screens/**/flow.yaml',
  { query: '?raw', import: 'default', eager: true }
)

/**
 * Returns the FlowConfig for the given route, if one exists.
 * Matches by checking if the route appears in any flow config's actions.
 */
export function useFlowConfig(route: string | null): FlowConfig | null {
  const flows = useMemo(() => {
    return Object.values(flowFiles).map((raw) => parseFlowConfig(raw))
  }, [])

  if (!route) return null

  return flows.find((config) => config.actions[route] != null) ?? null
}
