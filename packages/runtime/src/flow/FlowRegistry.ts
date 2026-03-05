import type { FlowAction, FlowActionV2 } from '../types.ts'

export type AnyFlowAction = FlowAction | FlowActionV2

let flowRegistry: Record<string, readonly AnyFlowAction[]> = {}

export function registerFlows(route: string, actions: readonly AnyFlowAction[]): void {
  flowRegistry = { ...flowRegistry, [route]: actions }
}

export function getFlowActions(route: string): readonly AnyFlowAction[] | null {
  return flowRegistry[route] ?? null
}

export function clearFlowRegistry(): void {
  flowRegistry = {}
}
