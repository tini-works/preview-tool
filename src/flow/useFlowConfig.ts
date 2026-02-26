import { useMemo } from 'react'
import type { FlowAction } from '@/flow/types'

interface FlowModule {
  actions: FlowAction[]
}

const flowModules = import.meta.glob<FlowModule>(
  '/src/screens/*/flow.ts',
  { eager: true }
)

function filePathToRoute(filePath: string): string {
  const match = filePath.match(/\/src\/screens\/([^/]+)\/flow\.ts$/)
  if (!match) return filePath
  return '/' + match[1].replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

export function useFlowActions(route: string | null): FlowAction[] | null {
  const routeMap = useMemo(() => {
    const map = new Map<string, FlowAction[]>()
    for (const [filePath, mod] of Object.entries(flowModules)) {
      map.set(filePathToRoute(filePath), mod.actions)
    }
    return map
  }, [])

  if (!route) return null
  return routeMap.get(route) ?? null
}
