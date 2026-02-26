import { useMemo } from 'react'
import type { ScreenEntry, ScreenModule, ScenarioModule } from '@/screens/types'

const screenModules = import.meta.glob<ScreenModule>(
  '/src/screens/*/index.tsx'
)

const scenarioModules = import.meta.glob<ScenarioModule & { flags?: Record<string, { label: string; default: boolean }>; hasListData?: boolean }>(
  '/src/screens/*/scenarios.ts',
  { eager: true }
)

function filePathToRoute(filePath: string): string {
  const match = filePath.match(/\/src\/screens\/([^/]+)\/index\.tsx$/)
  if (!match) return filePath

  const folderName = match[1]
  const kebab = folderName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()

  return `/${kebab}`
}

function toScenariosPath(screenPath: string): string {
  return screenPath.replace(/\/index\.tsx$/, '/scenarios.ts')
}

export function useScreenModules(): ScreenEntry[] {
  return useMemo(() => {
    return Object.entries(screenModules).map(([filePath, loader]) => {
      const scenariosPath = toScenariosPath(filePath)
      const scenarioMod = scenarioModules[scenariosPath]

      return {
        route: filePathToRoute(filePath),
        module: loader,
        scenarios: scenarioMod?.scenarios ?? {},
        flags: scenarioMod?.flags,
        hasListData: scenarioMod?.hasListData,
      }
    })
  }, [])
}

export function useScreenRoutes(): string[] {
  const modules = useScreenModules()
  return useMemo(() => modules.map((m) => m.route), [modules])
}
