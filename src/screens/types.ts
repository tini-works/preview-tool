import type { ComponentType } from 'react'

export interface Scenario<T = unknown> {
  label: string
  data: T
}

export interface ScreenModule {
  default: ComponentType<{ data: unknown }>
}

export interface ScenarioModule {
  scenarios: Record<string, Scenario>
}

export interface ScreenEntry {
  route: string
  module: () => Promise<ScreenModule>
  scenarios: Record<string, Scenario>
}
