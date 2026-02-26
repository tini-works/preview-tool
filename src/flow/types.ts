export interface FlowAction {
  trigger: string
  setState?: string
  setRegionState?: { region: string; state: string }
  navigate?: string
  navigateState?: string
}
