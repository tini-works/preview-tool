// packages/cli/src/analyzer/types.ts

// --- Screen Discovery ---

export interface DiscoveredScreen {
  readonly name: string
  readonly path: string
  readonly file: string
  readonly score: number
  readonly source: 'router' | 'convention' | 'heuristic'
}

export interface RouterRoute {
  readonly path: string
  readonly componentFile: string
  readonly componentName: string
}

// --- Hook Analysis ---

export type HookCategory =
  | 'data-fetching'
  | 'auth'
  | 'navigation'
  | 'i18n'
  | 'state'
  | 'custom'
  | 'unknown'

export interface ExtractedHook {
  readonly hookName: string
  readonly importPath: string
  readonly callArgs: readonly string[]
  readonly isProjectLocal: boolean
}

export interface ClassifiedHook extends ExtractedHook {
  readonly category: HookCategory
  readonly regionName: string
  readonly states: readonly string[]
  readonly defaultState: string
  readonly isList: boolean
  readonly returnShape: HookReturnShape | null
}

export interface HookReturnShape {
  readonly fields: readonly HookReturnField[]
}

export interface HookReturnField {
  readonly name: string
  readonly type: string
  readonly nullable: boolean
}

// --- Regions (derived from hooks) ---

export interface ScreenRegion {
  readonly name: string
  readonly label: string
  readonly source: string
  readonly states: readonly string[]
  readonly defaultState: string
  readonly isList: boolean
  readonly mockData: Readonly<Record<string, Readonly<Record<string, unknown>>>>
}

// --- Screen Analysis Result ---

export interface ScreenAnalysisResult {
  readonly screen: DiscoveredScreen
  readonly hooks: readonly ClassifiedHook[]
  readonly regions: readonly ScreenRegion[]
}

// --- Generation Output ---

export interface GenerationManifest {
  readonly screens: readonly ScreenManifestEntry[]
  readonly aliases: Record<string, string>
  readonly mocksDir: string
}

export interface ScreenManifestEntry {
  readonly name: string
  readonly path: string
  readonly file: string
  readonly regions: readonly ScreenRegion[]
}
