export interface DiscoveredScreen {
  filePath: string
  route: string
  pattern: 'mvc' | 'props' | 'hooks' | 'monolithic'
  viewFile?: string
  modelFile?: string
  controllerFile?: string
  /** Named export identifier (e.g. 'BookingPage'). Undefined means default export. */
  exportName?: string
}

export interface AnalyzedRegion {
  key: string
  label: string
  states: Record<string, Record<string, unknown>>
  defaultState: string
  isList?: boolean
  defaultCount?: number
  mockItems?: unknown[]
}

export interface AnalyzedFlow {
  trigger: string
  transition?: Record<string, string>
  delay?: number
  then?: Record<string, string>
  navigate?: string
}

export interface ScreenAnalysis {
  screen: DiscoveredScreen
  regions: Record<string, AnalyzedRegion>
  flows: AnalyzedFlow[]
}

// === Build V: View Tree ===

export interface PropDefinition {
  name: string
  type: string
  required: boolean
  defaultValue?: string
}

export interface ViewNode {
  component: string
  source: 'ui' | 'block' | 'local' | 'external'
  importPath: string
  props: PropDefinition[]
  children: ViewNode[]
}

export interface ViewTree {
  screenName: string
  filePath: string
  exportType: 'default' | 'named'
  exportName?: string
  dataProps: PropDefinition[]
  tree: ViewNode[]
}

// === Build M: Model ===

export interface ComponentRegion {
  label: string
  component: string
  componentPath: string
  states: Record<string, Record<string, unknown>>
  defaultState: string
  isList?: boolean
  mockItems?: unknown[]
  defaultCount?: number
}

export interface ModelOutput {
  regions: Record<string, ComponentRegion>
}

// === Build C: Controller ===

export interface ComponentTrigger {
  selector: string
  text?: string
  ariaLabel?: string
  nth?: number
}

export interface ComponentStateMachine {
  component: string
  states: string[]
  defaultState: string
  transitions: { from: string; to: string; on: string }[]
}

export interface UserJourney {
  name: string
  steps: { action: string; expectedState: string }[]
}

export interface FlowActionV2 {
  trigger: ComponentTrigger
  navigate?: string
  navigateState?: string
  setRegionState?: { region: string; state: string }
}

export interface ControllerOutput {
  flows: FlowActionV2[]
  componentStates: Record<string, ComponentStateMachine>
  journeys: UserJourney[]
}

// === Combined LLM Output ===

export interface LLMGenerationOutput {
  model: ModelOutput
  controller: ControllerOutput
}
