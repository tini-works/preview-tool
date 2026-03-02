import type { ComponentType } from 'react'

export interface FlagDefinition {
  label: string
  default: boolean
}

export interface FlagModule {
  flags: Record<string, FlagDefinition>
}

export interface RegionDefinition {
  label: string
  states: Record<string, Record<string, unknown>>
  defaultState: string
  isList?: boolean
  mockItems?: unknown[]
  defaultCount?: number
  hookMapping?: HookMapping
}

export interface HookMapping {
  type: 'query-hook' | 'custom-hook' | 'store' | 'context' | 'prop' | 'local-state' | 'unknown'
  hookName: string
  identifier: string
  importPath: string
}

export interface RegionDataEntry {
  activeState: string
  stateData: Record<string, unknown>
}

export type RegionDataMap = Record<string, RegionDataEntry>

export type RegionsMap = Record<string, RegionDefinition>

export interface ScreenModule {
  default: ComponentType<{ regionData?: RegionDataMap; flags?: Record<string, boolean> }>
}

export interface RegionsModule {
  regions: RegionsMap
}

export interface ScreenEntry {
  route: string
  module: () => Promise<ScreenModule>
  flags?: Record<string, FlagDefinition>
  regions?: RegionsMap
}

export interface FlowAction {
  trigger: string
  setState?: string
  setRegionState?: { region: string; state: string }
  navigate?: string
  navigateState?: string
}

// === Component-level regions (from CLI MVC generation) ===

export interface ComponentRegion extends RegionDefinition {
  component?: string
  componentPath?: string
}

// === DOM-based trigger matching (no data-flow-target required) ===

export interface ComponentTrigger {
  selector: string
  text?: string
  ariaLabel?: string
  nth?: number
}

export interface FlowActionV2 {
  trigger: ComponentTrigger
  navigate?: string
  navigateState?: string
  setRegionState?: { region: string; state: string }
}
