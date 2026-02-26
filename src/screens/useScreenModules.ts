import { useMemo } from 'react'
import type { ScreenEntry, ScreenModule, ScenarioModule, RegionsMap } from '@/screens/types'
import { featureFlagConfig } from '@/config/feature-flags'

const screenModules = import.meta.glob<ScreenModule>(
  '/src/screens/**/index.tsx'
)

const scenarioModules = import.meta.glob<ScenarioModule & { flags?: Record<string, { label: string; default: boolean }>; regions?: RegionsMap }>(
  '/src/screens/**/scenarios.ts',
  { eager: true }
)

function filePathToRoute(filePath: string): string {
  const match = filePath.match(/\/src\/screens\/(.+)\/index\.tsx$/)
  if (!match) return filePath
  return `/${match[1]}`
}

function toScenariosPath(screenPath: string): string {
  return screenPath.replace(/\/index\.tsx$/, '/scenarios.ts')
}

export function useScreenModules(): ScreenEntry[] {
  return useMemo(() => {
    return Object.entries(screenModules)
      .filter(([filePath]) => !filePath.includes('/_shared/'))
      .map(([filePath, loader]) => {
        const scenariosPath = toScenariosPath(filePath)
        const scenarioMod = scenarioModules[scenariosPath]

        return {
          route: filePathToRoute(filePath),
          module: loader,
          scenarios: scenarioMod?.scenarios ?? {},
          flags: scenarioMod?.flags,
          regions: scenarioMod?.regions,
        }
      })
  }, [])
}

export function useScreenRoutes(): string[] {
  const modules = useScreenModules()
  return useMemo(() => modules.map((m) => m.route), [modules])
}
