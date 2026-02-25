import { useMemo } from 'react'
import { parseFlowConfig, type FlowConfig } from '@/flow/FlowEngine'

const flowFiles = import.meta.glob<string>(
  '/content/**/flow.yaml',
  { query: '?raw', import: 'default', eager: true }
)

interface FlowEntry {
  /** Directory prefix, e.g. "/booking" */
  prefix: string
  config: FlowConfig
}

function filePathToPrefix(filePath: string): string {
  return filePath
    .replace(/^\/content/, '')
    .replace(/\/flow\.yaml$/, '')
}

/**
 * Returns the FlowConfig for the given route, if one exists.
 * Matches by checking if the route starts with any flow directory prefix.
 */
export function useFlowConfig(route: string | null): FlowConfig | null {
  const flows = useMemo<FlowEntry[]>(() => {
    return Object.entries(flowFiles).map(([filePath, raw]) => ({
      prefix: filePathToPrefix(filePath),
      config: parseFlowConfig(raw),
    }))
  }, [])

  if (!route) return null

  const match = flows.find((f) => route.startsWith(f.prefix))
  return match?.config ?? null
}
