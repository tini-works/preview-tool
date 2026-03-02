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
  hookMapping?: {
    type: HookMappingType
    hookName: string
    identifier: string
    importPath: string
  }
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
  hookMapping?: {
    type: HookMappingType
    hookName: string
    identifier: string
    importPath: string
  }
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

// === Hook Mapping Types ===

export type HookMappingType = 'query-hook' | 'custom-hook' | 'store' | 'context' | 'prop' | 'local-state' | 'unknown'

// === Hook Analysis (for module aliasing) ===

export interface HookAnalysis {
  /** Hook function name as used in the component (e.g., 'useAppLiveQuery') */
  hookName: string
  /** Full import path (e.g., '@/hooks/use-app-live-query') */
  importPath: string
  /** Section/region ID if detectable from call arguments (e.g., 'service-grid') */
  sectionId?: string
  /** React Query key if detectable (e.g., ['services']) */
  queryKey?: string
  /** Return shape: what the hook returns */
  returnShape: 'data-loading-error' | 'state-setter' | 'unknown'
  /** Mapping type for the region data context */
  hookMappingType?: HookMappingType
}

export interface ImportAnalysis {
  /** Import path (e.g., '@/stores/auth') */
  path: string
  /** Named exports used (e.g., ['useAuthStore']) */
  namedExports: string[]
  /** Whether this import needs mocking */
  needsMocking: boolean
  /** Why it needs mocking */
  reason: 'data-hook' | 'auth-store' | 'devtool-store' | 'api-client' | 'collection'
}

export interface HookAnalysisResult {
  hooks: HookAnalysis[]
  imports: ImportAnalysis[]
}
