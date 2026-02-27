export interface DiscoveredScreen {
  filePath: string
  route: string
  pattern: 'mvc' | 'props' | 'hooks' | 'monolithic'
  viewFile?: string
  modelFile?: string
  controllerFile?: string
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
