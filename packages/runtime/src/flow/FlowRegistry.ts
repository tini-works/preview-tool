import type { FlowAction } from '../types.ts'

let flowRegistry: Record<string, FlowAction[]> = {}

export function registerFlows(route: string, actions: FlowAction[]): void {
  flowRegistry = { ...flowRegistry, [route]: actions }
}

export function getFlowActions(route: string): FlowAction[] | null {
  return flowRegistry[route] ?? null
}

export function clearFlowRegistry(): void {
  flowRegistry = {}
}
