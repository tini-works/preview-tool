import type { ScreenAnalysisOutput } from '../llm/schemas/screen-analysis.js'
import type {
  ModelOutput,
  ControllerOutput,
  FlowActionV2,
  HookMappingType,
  ComponentRegion,
} from '../analyzer/types.js'
import { parseHookBinding } from '../lib/hook-binding.js'

/**
 * Infers a HookMappingType from a hook name string.
 *
 * Naming conventions:
 * - useQuery / useSWR / useFetch → 'query-hook'
 * - *Store → 'store'
 * - useContext → 'context'
 * - useLiveQuery / useAppLiveQuery → 'custom-hook'
 * - anything else → 'unknown'
 */
export function inferHookMappingType(hookName: string): HookMappingType {
  const lower = hookName.toLowerCase()

  if (
    lower === 'usequery' ||
    lower === 'useswr' ||
    lower === 'usefetch' ||
    (lower.includes('query') && !lower.includes('livequery'))
  ) {
    return 'query-hook'
  }

  if (lower.endsWith('store') || /^use\w+Store$/.test(hookName)) {
    return 'store'
  }

  if (lower === 'usecontext') {
    return 'context'
  }

  if (lower.includes('livequery')) {
    return 'custom-hook'
  }

  if (lower === 'usestate' || lower === 'useref') {
    return 'local-state'
  }

  return 'unknown'
}

/**
 * Converts a ScreenAnalysisOutput into a ModelOutput.
 *
 * For each region in the analysis:
 * 1. Flattens states from { stateName: { label, mockData } } to { stateName: mockData }
 * 2. Derives hookMapping from the first hookBinding
 * 3. Builds a ComponentRegion with all relevant fields
 */
export function analysisToModel(analysis: ScreenAnalysisOutput): ModelOutput {
  const regions: Record<string, ComponentRegion> = {}

  for (const region of analysis.regions) {
    // Flatten states: { stateName: { label, mockData } } → { stateName: mockData }
    const flatStates: Record<string, Record<string, unknown>> = {}
    for (const [stateName, stateValue] of Object.entries(region.states)) {
      flatStates[stateName] = stateValue.mockData
    }

    // Derive hookMapping from the first hookBinding
    let hookMapping: ComponentRegion['hookMapping'] = undefined
    if (region.hookBindings.length > 0) {
      const parsed = parseHookBinding(region.hookBindings[0])
      if (parsed) {
        hookMapping = {
          type: inferHookMappingType(parsed.hookName),
          hookName: parsed.hookName,
          identifier: region.key,
          importPath: '',
        }
      }
    }

    const componentRegion: ComponentRegion = {
      label: region.label,
      component: 'Screen',
      componentPath: '',
      states: flatStates,
      defaultState: region.defaultState,
      ...(hookMapping ? { hookMapping } : {}),
      ...(region.isList !== undefined ? { isList: region.isList } : {}),
      ...(region.mockItems !== undefined ? { mockItems: region.mockItems } : {}),
      ...(region.defaultCount !== undefined ? { defaultCount: region.defaultCount } : {}),
    }

    regions[region.key] = componentRegion
  }

  return { regions }
}

/**
 * Converts a ScreenAnalysisOutput into a ControllerOutput.
 *
 * For each flow in the analysis:
 * - 'navigate' action → { trigger, navigate: target }
 * - 'setRegionState' action → { trigger, setRegionState: { region, state } }
 * - 'setState' action → { trigger, navigate: target } (treated as navigate)
 */
export function analysisToController(analysis: ScreenAnalysisOutput): ControllerOutput {
  const flows: FlowActionV2[] = analysis.flows.map((flow) => {
    const trigger = {
      selector: flow.trigger.selector,
      ...(flow.trigger.text ? { text: flow.trigger.text } : {}),
      ...(flow.trigger.ariaLabel ? { ariaLabel: flow.trigger.ariaLabel } : {}),
      ...(flow.trigger.nth !== undefined ? { nth: flow.trigger.nth } : {}),
    }

    if (flow.action === 'navigate' || flow.action === 'setState') {
      return { trigger, navigate: flow.target }
    }

    // setRegionState
    return {
      trigger,
      setRegionState: {
        region: flow.targetRegion ?? '',
        state: flow.target,
      },
    }
  })

  return {
    flows,
    componentStates: {},
    journeys: [],
  }
}
