import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Checks if an override file exists for a given mock ID.
 * Override files are user-maintained in `.preview/overrides/{mockId}.ts`
 * and are merged at runtime via import.meta.glob — not at build time.
 *
 * This function is used during generation to skip overwriting existing overrides.
 */
export function hasOverride(previewDir: string, mockId: string): boolean {
  const overridePath = join(previewDir, 'overrides', `${mockId}.ts`)
  return existsSync(overridePath)
}

/**
 * Returns the list of override file paths that exist in the overrides directory.
 * Used by the generator to avoid overwriting user-maintained files.
 */
export function getOverridePaths(previewDir: string, mockIds: string[]): string[] {
  return mockIds
    .map((id) => join(previewDir, 'overrides', `${id}.ts`))
    .filter((path) => existsSync(path))
}
