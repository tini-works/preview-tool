import { join } from 'node:path'
import { createRequire } from 'node:module'
import type { PreviewConfig } from '../lib/config.js'
import { PREVIEW_DIR } from '../lib/config.js'

/**
 * Creates a Vite InlineConfig for the preview dev server.
 * Dynamically requires @vitejs/plugin-react from the host project.
 */
export async function createViteConfig(
  cwd: string,
  config: PreviewConfig
): Promise<Record<string, unknown>> {
  const previewDir = join(cwd, PREVIEW_DIR)

  // Dynamically import the React plugin from host project
  let reactPlugin: unknown = null
  try {
    const require = createRequire(join(cwd, 'package.json'))
    const reactPluginFactory = require('@vitejs/plugin-react')
    const factory = reactPluginFactory.default ?? reactPluginFactory
    reactPlugin = factory()
  } catch {
    console.warn('Warning: @vitejs/plugin-react not found. Install it in your project.')
  }

  const plugins = reactPlugin ? [reactPlugin] : []

  return {
    root: previewDir,
    server: {
      port: config.port,
      open: true,
    },
    resolve: {
      alias: {
        '@host': join(cwd, 'src'),
        '@preview': previewDir,
      },
    },
    plugins,
    optimizeDeps: {
      include: ['react', 'react-dom'],
    },
  }
}
