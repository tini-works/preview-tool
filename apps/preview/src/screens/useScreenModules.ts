import { useMemo } from 'react'
import type { ScreenEntry, ScreenModule, RegionsModule, FlagDefinition } from '@/screens/types'

const screenModules = import.meta.glob<ScreenModule>(
  '/src/screens/**/index.tsx'
)

const scenarioModules = import.meta.glob<RegionsModule & { flags?: Record<string, FlagDefinition> }>(
  '/src/screens/**/scenarios.ts',
  { eager: true }
)

const flagModules = import.meta.glob<{ flags: Record<string, FlagDefinition> }>(
  '/src/screens/**/flags.ts',
  { eager: true }
)

function filePathToRoute(filePath: string): string {
  const match = filePath.match(/\/src\/screens\/(.+)\/index\.tsx$/)
  if (!match) return filePath
  return `/${match[1]}`
}

function toCompanionPath(screenPath: string, filename: string): string {
  return screenPath.replace(/\/index\.tsx$/, `/${filename}`)
}

export function useScreenModules(): ScreenEntry[] {
  return useMemo(() => {
    return Object.entries(screenModules)
      .filter(([filePath]) => !filePath.includes('/_shared/'))
      .map(([filePath, loader]) => {
        const scenariosPath = toCompanionPath(filePath, 'scenarios.ts')
        const flagsPath = toCompanionPath(filePath, 'flags.ts')
        const scenarioMod = scenarioModules[scenariosPath]
        const flagMod = flagModules[flagsPath]
        const route = filePathToRoute(filePath)

        return {
          route,
          module: loader,
          flags: flagMod?.flags ?? scenarioMod?.flags,
          regions: scenarioMod?.regions,
        }
      })
  }, [])
}

export function useScreenRoutes(): string[] {
  const modules = useScreenModules()
  return useMemo(() => modules.map((m) => m.route), [modules])
}
