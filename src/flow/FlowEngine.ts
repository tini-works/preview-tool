import YAML from 'yaml'

export interface FlowAction {
  trigger: string
  setState?: string
  navigate?: string
  navigateState?: string
}

export interface FlowConfig {
  name: string
  startRoute: string
  startState: string
  actions: Record<string, FlowAction[]>
}

/**
 * Parse a raw YAML string into a FlowConfig.
 */
export function parseFlowConfig(raw: string): FlowConfig {
  return YAML.parse(raw) as FlowConfig
}

/**
 * Find the matching action for a route + trigger combination.
 * Returns the first matching action, or null if none found.
 */
export function findAction(
  config: FlowConfig,
  route: string,
  trigger: string
): FlowAction | null {
  const routeActions = config.actions[route]
  if (!routeActions) return null

  return routeActions.find((a) => a.trigger === trigger) ?? null
}
