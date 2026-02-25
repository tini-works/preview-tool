import { useState } from "react"

export type Scenario<T> = {
  label: string
  data: T
}

export function useScenarios<T>(
  scenarios: Record<string, Scenario<T>>,
  defaultKey?: string
) {
  const keys = Object.keys(scenarios)
  const [activeKey, setActiveKey] = useState(defaultKey ?? keys[0])
  const active = scenarios[activeKey]

  return { activeKey, setActiveKey, active, scenarios }
}
