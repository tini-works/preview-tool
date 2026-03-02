import fs from 'node:fs'
import path from 'node:path'
import type { PreviewConfig } from '../lib/config.js'
import { generateAll } from '../generator/index.js'

export function createWatcher(
  cwd: string,
  config: PreviewConfig,
  onChange: () => void,
): { close: () => void } {
  const srcDir = path.join(cwd, 'src')

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  const watcher = fs.watch(srcDir, { recursive: true }, (_eventType, filename) => {
    if (!filename) return
    if (!filename.endsWith('.tsx') && !filename.endsWith('.ts')) return
    if (filename.includes('node_modules')) return
    if (filename.includes('.preview')) return

    // Debounce: wait 300ms after last change before re-analyzing
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(async () => {
      try {
        await generateAll(cwd, config)
        onChange()
      } catch (error) {
        console.error('Watch re-analysis failed:', error)
      }
    }, 300)
  })

  return {
    close: () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      watcher.close()
    },
  }
}
