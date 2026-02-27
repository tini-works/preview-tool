import { useEffect } from 'react'
import { registerFlows } from '@preview-tool/runtime'
import type { FlowAction } from '@preview-tool/runtime'

interface FlowModule {
  actions: FlowAction[]
}

const flowModules = import.meta.glob<FlowModule>(
  '/src/screens/**/flow.ts',
  { eager: true }
)

function filePathToRoute(filePath: string): string {
  const match = filePath.match(/\/src\/screens\/(.+)\/flow\.ts$/)
  if (!match) return filePath
  return `/${match[1]}`
}

export function useFlowRegistration(): void {
  useEffect(() => {
    for (const [filePath, mod] of Object.entries(flowModules)) {
      const route = filePathToRoute(filePath)
      registerFlows(route, mod.actions)
    }
  }, [])
}
