import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'

export function resolveRuntimePath(): string {
  const require = createRequire(import.meta.url)
  const runtimeEntry = require.resolve('@preview-tool/runtime')
  let dir = dirname(runtimeEntry)
  for (let i = 0; i < 5; i++) {
    try {
      require.resolve(join(dir, 'package.json'))
      return dir
    } catch {
      dir = dirname(dir)
    }
  }
  return dirname(runtimeEntry)
}
