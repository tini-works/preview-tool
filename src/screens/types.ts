import type { ComponentType } from 'react'

export interface Scenario<T = unknown> {
  label: string
  data: T
}

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
}

export type RegionsMap = Record<string, RegionDefinition>

export interface ScreenModule {
  default: ComponentType<{ data: unknown; flags?: Record<string, boolean> }>
}

export interface ScenarioModule {
  scenarios: Record<string, Scenario>
}

export interface ScreenEntry {
  route: string
  module: () => Promise<ScreenModule>
  scenarios: Record<string, Scenario>
  flags?: Record<string, FlagDefinition>
  regions?: RegionsMap
}
