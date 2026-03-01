# External App Preview — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the preview-tool CLI to scan and preview external React apps with a single command, supporting both local paths and GitHub URLs.

**Architecture:** Add three new modules to `packages/cli/src/` — source resolver (URL vs path detection + git clone), framework detector (package.json + file structure analysis), and wrapper generator (auto-detect providers). Wire them into a new combined `preview` command that orchestrates init → generate → dev in one shot. No changes to the runtime package.

**Tech Stack:** Commander.js (CLI), Node.js child_process (git clone, npm install), ts-morph (AST), Zod (validation), chalk (output)

---

## Task 1: Source Resolver Module

Creates a module that resolves CLI input (local path or GitHub URL) into an absolute local directory path.

**Files:**
- Create: `packages/cli/src/resolver/resolve-source.ts`
- Create: `packages/cli/src/resolver/types.ts`
- Test: `packages/cli/src/resolver/__tests__/resolve-source.test.ts`

**Step 1: Write the types**

```typescript
// packages/cli/src/resolver/types.ts
export interface ResolvedSource {
  /** Absolute path to the frontend project root */
  cwd: string
  /** Whether this was cloned from a remote URL */
  isRemote: boolean
  /** Temp directory to clean up on exit (only if isRemote) */
  tempDir?: string
}

export interface ResolveOptions {
  /** Subdirectory within the repo (for monorepos) */
  path?: string
  /** Keep temp directory on exit instead of cleaning up */
  keep?: boolean
}
```

**Step 2: Write the failing test**

```typescript
// packages/cli/src/resolver/__tests__/resolve-source.test.ts
import { describe, it, expect } from 'vitest'
import { isGitUrl, parseGitUrl } from '../resolve-source.js'

describe('isGitUrl', () => {
  it('detects HTTPS GitHub URLs', () => {
    expect(isGitUrl('https://github.com/user/repo')).toBe(true)
  })

  it('detects shorthand GitHub URLs', () => {
    expect(isGitUrl('github.com/user/repo')).toBe(true)
  })

  it('detects SSH git URLs', () => {
    expect(isGitUrl('git@github.com:user/repo.git')).toBe(true)
  })

  it('rejects local paths', () => {
    expect(isGitUrl('./my-app')).toBe(false)
    expect(isGitUrl('~/Desktop/booking')).toBe(false)
    expect(isGitUrl('/absolute/path')).toBe(false)
  })
})

describe('parseGitUrl', () => {
  it('normalizes shorthand to HTTPS', () => {
    expect(parseGitUrl('github.com/user/repo')).toBe('https://github.com/user/repo.git')
  })

  it('adds .git suffix if missing', () => {
    expect(parseGitUrl('https://github.com/user/repo')).toBe('https://github.com/user/repo.git')
  })

  it('keeps .git suffix if present', () => {
    expect(parseGitUrl('https://github.com/user/repo.git')).toBe('https://github.com/user/repo.git')
  })
})
```

**Step 3: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/resolver/__tests__/resolve-source.test.ts`
Expected: FAIL — module does not exist

**Step 4: Implement the source resolver**

```typescript
// packages/cli/src/resolver/resolve-source.ts
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ResolvedSource, ResolveOptions } from './types.js'

export function isGitUrl(input: string): boolean {
  if (input.startsWith('https://') || input.startsWith('http://')) return true
  if (input.startsWith('git@')) return true
  if (/^github\.com\//.test(input)) return true
  if (/^gitlab\.com\//.test(input)) return true
  if (/^bitbucket\.org\//.test(input)) return true
  return false
}

export function parseGitUrl(input: string): string {
  let url = input

  // Normalize shorthand (github.com/user/repo → https://github.com/user/repo)
  if (!url.startsWith('https://') && !url.startsWith('http://') && !url.startsWith('git@')) {
    url = `https://${url}`
  }

  // Add .git suffix if missing
  if (!url.endsWith('.git')) {
    url = `${url}.git`
  }

  return url
}

export async function resolveSource(
  input: string,
  options: ResolveOptions = {}
): Promise<ResolvedSource> {
  if (isGitUrl(input)) {
    return resolveRemote(input, options)
  }
  return resolveLocal(input, options)
}

function resolveLocal(input: string, options: ResolveOptions): ResolvedSource {
  // Expand ~ to home directory
  const expanded = input.startsWith('~')
    ? input.replace('~', process.env.HOME ?? '')
    : input

  let cwd = resolve(expanded)

  // Navigate to subdirectory if --path specified
  if (options.path) {
    cwd = join(cwd, options.path)
  }

  if (!existsSync(cwd)) {
    throw new Error(`Directory not found: ${cwd}`)
  }

  return { cwd, isRemote: false }
}

async function resolveRemote(input: string, options: ResolveOptions): Promise<ResolvedSource> {
  const gitUrl = parseGitUrl(input)

  // Create temp directory
  const tempDir = await mkdtemp(join(tmpdir(), 'preview-tool-'))

  // Clone with minimal depth
  execSync(`git clone --depth 1 --single-branch ${gitUrl} ${tempDir}`, {
    stdio: 'pipe',
  })

  let cwd = tempDir

  // Navigate to subdirectory if --path specified
  if (options.path) {
    cwd = join(cwd, options.path)
    if (!existsSync(cwd)) {
      throw new Error(`Subdirectory not found in cloned repo: ${options.path}`)
    }
  }

  return { cwd, isRemote: true, tempDir: options.keep ? undefined : tempDir }
}
```

**Step 5: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/resolver/__tests__/resolve-source.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/cli/src/resolver/
git commit -m "feat(cli): add source resolver for local paths and GitHub URLs"
```

---

## Task 2: Framework Detector Module

Detects the external app's framework, bundler, page directory pattern, and dependencies by reading package.json and scanning the file structure.

**Files:**
- Create: `packages/cli/src/resolver/detect-framework.ts`
- Test: `packages/cli/src/resolver/__tests__/detect-framework.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/cli/src/resolver/__tests__/detect-framework.test.ts
import { describe, it, expect } from 'vitest'
import { detectFramework } from '../detect-framework.js'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('detectFramework', () => {
  it('detects React + Vite with src/pages/', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^19.0.0' },
      devDependencies: { vite: '^6.0.0' },
      scripts: { dev: 'vite' },
    }))
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'home.tsx'), 'export default function Home() {}')

    const result = await detectFramework(dir)

    expect(result.name).toBe('react')
    expect(result.bundler).toBe('vite')
    expect(result.pagePattern).toBe('src/pages/**/*.tsx')
  })

  it('detects React + Vite with src/screens/', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^19.0.0' },
      devDependencies: { vite: '^6.0.0' },
      scripts: { dev: 'vite' },
    }))
    await mkdir(join(dir, 'src', 'screens', 'login'), { recursive: true })
    await writeFile(join(dir, 'src', 'screens', 'login', 'index.tsx'), 'export default function Login() {}')

    const result = await detectFramework(dir)

    expect(result.pagePattern).toBe('src/screens/**/index.tsx')
  })

  it('detects i18n when react-i18next is present', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^19.0.0', 'react-i18next': '^15.0.0' },
      devDependencies: { vite: '^6.0.0' },
      scripts: { dev: 'vite' },
    }))
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'home.tsx'), '')

    const result = await detectFramework(dir)

    expect(result.providers).toContain('react-i18next')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/resolver/__tests__/detect-framework.test.ts`
Expected: FAIL

**Step 3: Implement framework detector**

```typescript
// packages/cli/src/resolver/detect-framework.ts
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { glob } from 'glob'

export interface DetectedFramework {
  name: 'react' | 'vue' | 'svelte' | 'unknown'
  bundler: 'vite' | 'webpack' | 'next' | 'unknown'
  pagePattern: string
  providers: string[]
}

const KNOWN_PROVIDERS = [
  '@tanstack/react-query',
  'react-router-dom',
  'react-i18next',
  '@chakra-ui/react',
  '@mui/material',
  '@emotion/react',
  'styled-components',
  'zustand',
  'redux',
  '@reduxjs/toolkit',
] as const

const PAGE_PATTERNS = [
  { dir: 'src/pages', glob: 'src/pages/**/*.tsx' },
  { dir: 'src/screens', glob: 'src/screens/**/index.tsx' },
  { dir: 'src/app', glob: 'src/app/**/page.tsx' },
  { dir: 'pages', glob: 'pages/**/*.tsx' },
  { dir: 'app', glob: 'app/**/page.tsx' },
] as const

export async function detectFramework(cwd: string): Promise<DetectedFramework> {
  const pkgPath = join(cwd, 'package.json')
  if (!existsSync(pkgPath)) {
    throw new Error(`No package.json found in ${cwd}`)
  }

  const raw = await readFile(pkgPath, 'utf-8')
  const pkg = JSON.parse(raw) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    scripts?: Record<string, string>
  }

  const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }

  // Detect framework
  const name = detectFrameworkName(allDeps)

  // Detect bundler
  const bundler = detectBundler(allDeps, cwd)

  // Detect page pattern
  const pagePattern = await detectPagePattern(cwd)

  // Detect providers
  const providers = KNOWN_PROVIDERS.filter((p) => p in allDeps)

  return { name, bundler, pagePattern, providers }
}

function detectFrameworkName(deps: Record<string, string>): DetectedFramework['name'] {
  if ('react' in deps || 'react-dom' in deps) return 'react'
  if ('vue' in deps) return 'vue'
  if ('svelte' in deps) return 'svelte'
  return 'unknown'
}

function detectBundler(deps: Record<string, string>, cwd: string): DetectedFramework['bundler'] {
  if ('next' in deps) return 'next'
  if ('vite' in deps || existsSync(join(cwd, 'vite.config.ts')) || existsSync(join(cwd, 'vite.config.js'))) return 'vite'
  if ('webpack' in deps) return 'webpack'
  return 'unknown'
}

async function detectPagePattern(cwd: string): Promise<string> {
  for (const pattern of PAGE_PATTERNS) {
    if (existsSync(join(cwd, pattern.dir))) {
      const matches = await glob(pattern.glob, { cwd, absolute: false })
      if (matches.length > 0) {
        return pattern.glob
      }
    }
  }

  // Fallback: broad search
  return 'src/**/*.tsx'
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/resolver/__tests__/detect-framework.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/resolver/detect-framework.ts packages/cli/src/resolver/__tests__/detect-framework.test.ts
git commit -m "feat(cli): add framework detector for external apps"
```

---

## Task 3: Wrapper Generator Module

Auto-generates a `.preview/wrapper.tsx` with detected providers instead of the empty template.

**Files:**
- Create: `packages/cli/src/resolver/generate-wrapper.ts`
- Test: `packages/cli/src/resolver/__tests__/generate-wrapper.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/cli/src/resolver/__tests__/generate-wrapper.test.ts
import { describe, it, expect } from 'vitest'
import { generateWrapperCode } from '../generate-wrapper.js'

describe('generateWrapperCode', () => {
  it('generates empty wrapper when no providers', () => {
    const code = generateWrapperCode([])
    expect(code).toContain('export function Wrapper')
    expect(code).toContain('{children}')
    expect(code).not.toContain('QueryClientProvider')
  })

  it('wraps with QueryClientProvider for @tanstack/react-query', () => {
    const code = generateWrapperCode(['@tanstack/react-query'])
    expect(code).toContain('QueryClientProvider')
    expect(code).toContain('QueryClient')
    expect(code).toContain("from '@tanstack/react-query'")
  })

  it('wraps with MemoryRouter for react-router-dom', () => {
    const code = generateWrapperCode(['react-router-dom'])
    expect(code).toContain('MemoryRouter')
    expect(code).toContain("from 'react-router-dom'")
  })

  it('wraps with I18nextProvider for react-i18next', () => {
    const code = generateWrapperCode(['react-i18next'])
    expect(code).toContain('I18nextProvider')
    expect(code).toContain("from 'react-i18next'")
  })

  it('nests multiple providers in correct order', () => {
    const code = generateWrapperCode(['@tanstack/react-query', 'react-router-dom', 'react-i18next'])
    // QueryClient should be outermost, then Router, then i18n
    const qcpIdx = code.indexOf('QueryClientProvider')
    const routerIdx = code.indexOf('MemoryRouter')
    const i18nIdx = code.indexOf('I18nextProvider')
    expect(qcpIdx).toBeLessThan(routerIdx)
    expect(routerIdx).toBeLessThan(i18nIdx)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/resolver/__tests__/generate-wrapper.test.ts`
Expected: FAIL

**Step 3: Implement wrapper generator**

```typescript
// packages/cli/src/resolver/generate-wrapper.ts

interface ProviderDef {
  dependency: string
  imports: string
  open: string
  close: string
  setup?: string
}

const PROVIDER_DEFS: ProviderDef[] = [
  {
    dependency: '@tanstack/react-query',
    imports: "import { QueryClient, QueryClientProvider } from '@tanstack/react-query'",
    setup: 'const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })',
    open: '<QueryClientProvider client={queryClient}>',
    close: '</QueryClientProvider>',
  },
  {
    dependency: 'react-router-dom',
    imports: "import { MemoryRouter } from 'react-router-dom'",
    open: '<MemoryRouter>',
    close: '</MemoryRouter>',
  },
  {
    dependency: 'react-i18next',
    imports: "import { I18nextProvider } from 'react-i18next'\nimport i18n from '@host/i18n'",
    open: '<I18nextProvider i18n={i18n}>',
    close: '</I18nextProvider>',
  },
  {
    dependency: '@chakra-ui/react',
    imports: "import { ChakraProvider } from '@chakra-ui/react'",
    open: '<ChakraProvider>',
    close: '</ChakraProvider>',
  },
  {
    dependency: '@mui/material',
    imports: "import { ThemeProvider, createTheme } from '@mui/material'",
    setup: 'const theme = createTheme()',
    open: '<ThemeProvider theme={theme}>',
    close: '</ThemeProvider>',
  },
]

export function generateWrapperCode(providers: string[]): string {
  const matched = PROVIDER_DEFS.filter((d) => providers.includes(d.dependency))

  const imports = [
    "import type { ReactNode } from 'react'",
    ...matched.map((m) => m.imports),
  ]

  const setups = matched
    .filter((m) => m.setup)
    .map((m) => m.setup)

  const indent = (level: number) => '  '.repeat(level)

  if (matched.length === 0) {
    return `${imports.join('\n')}

export function Wrapper({ children }: { children: ReactNode }) {
  return <>{children}</>
}
`
  }

  // Build nested JSX
  let jsx = ''
  let depth = 2
  for (const m of matched) {
    jsx += `${indent(depth)}${m.open}\n`
    depth++
  }
  jsx += `${indent(depth)}{children}\n`
  for (const m of [...matched].reverse()) {
    depth--
    jsx += `${indent(depth)}${m.close}\n`
  }

  return `// Auto-generated by preview-tool — edit freely, this file is not overwritten on re-generate.
${imports.join('\n')}

${setups.join('\n')}

export function Wrapper({ children }: { children: ReactNode }) {
  return (
${jsx.trimEnd()}
  )
}
`
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/resolver/__tests__/generate-wrapper.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/resolver/generate-wrapper.ts packages/cli/src/resolver/__tests__/generate-wrapper.test.ts
git commit -m "feat(cli): add wrapper generator for external app providers"
```

---

## Task 4: Combined `preview` Command

A single default command that runs init → generate → dev when given a path or URL argument.

**Files:**
- Create: `packages/cli/src/commands/preview.ts`
- Modify: `packages/cli/src/index.ts` — register the new command as the default action
- Modify: `packages/cli/src/commands/init.ts` — extract init logic into reusable function

**Step 1: Refactor init.ts to export a reusable function**

Extract the core init logic from the command action into a standalone `initPreview()` function:

```typescript
// Add to packages/cli/src/commands/init.ts (new export, keep existing command)

export async function initPreview(
  cwd: string,
  config: PreviewConfig,
  wrapperCode?: string
): Promise<void> {
  const previewDir = join(cwd, PREVIEW_DIR)

  for (const sub of PREVIEW_SUBDIRS) {
    const subDir = join(previewDir, sub)
    await mkdir(subDir, { recursive: true })
    const gitkeep = join(subDir, '.gitkeep')
    if (!existsSync(gitkeep)) {
      await writeFile(gitkeep, '', 'utf-8')
    }
  }

  await writeConfig(cwd, config)

  const wrapperPath = join(previewDir, 'wrapper.tsx')
  if (!existsSync(wrapperPath)) {
    await writeFile(wrapperPath, wrapperCode ?? generateWrapperTemplate(), 'utf-8')
  }

  await ensureGitignore(cwd)
}
```

**Step 2: Create the preview command**

```typescript
// packages/cli/src/commands/preview.ts
import { Command } from 'commander'
import { resolve } from 'node:path'
import chalk from 'chalk'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { resolveSource } from '../resolver/resolve-source.js'
import { detectFramework } from '../resolver/detect-framework.js'
import { generateWrapperCode } from '../resolver/generate-wrapper.js'
import { initPreview } from './init.js'
import { generateAll } from '../generator/index.js'
import { readConfig, DEFAULT_CONFIG, PREVIEW_DIR } from '../lib/config.js'
import { generateEntryFiles } from '../server/generate-entry.js'
import { createViteConfig } from '../server/create-vite-config.js'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

export const previewCommand = new Command('preview')
  .description('Preview an external app (init + generate + dev in one command)')
  .argument('<source>', 'Local path or GitHub URL to the frontend project')
  .option('--path <subdir>', 'Subdirectory within the repo (for monorepos)')
  .option('--keep', 'Keep cloned temp directory on exit')
  .option('--no-llm', 'Skip LLM generation, use heuristic fallback only')
  .option('-p, --port <port>', 'Dev server port')
  .action(async (source: string, options: {
    path?: string
    keep?: boolean
    llm: boolean
    port?: string
  }) => {
    console.log(chalk.bold('\nPreview Tool\n'))

    // Step 1: Resolve source
    console.log(chalk.dim(`Resolving source: ${source}`))
    const resolved = await resolveSource(source, {
      path: options.path,
      keep: options.keep,
    })
    console.log(chalk.dim(`  Working directory: ${resolved.cwd}`))

    // Step 2: Detect framework
    console.log(chalk.dim('\nDetecting framework...'))
    const framework = await detectFramework(resolved.cwd)
    console.log(`  Framework:  ${chalk.cyan(framework.name)}`)
    console.log(`  Bundler:    ${chalk.cyan(framework.bundler)}`)
    console.log(`  Pages:      ${chalk.cyan(framework.pagePattern)}`)
    if (framework.providers.length > 0) {
      console.log(`  Providers:  ${chalk.cyan(framework.providers.join(', '))}`)
    }

    // Step 3: Install dependencies if remote
    if (resolved.isRemote) {
      console.log(chalk.dim('\nInstalling dependencies...'))
      const pkgManager = detectPackageManager(resolved.cwd)
      execSync(`${pkgManager} install`, { cwd: resolved.cwd, stdio: 'pipe' })
      console.log(chalk.dim(`  Done (${pkgManager})`))
    }

    // Step 4: Init .preview/ directory
    const previewDir = join(resolved.cwd, PREVIEW_DIR)
    if (!existsSync(previewDir)) {
      console.log(chalk.dim('\nInitializing .preview/ directory...'))
      const config = {
        ...DEFAULT_CONFIG,
        screenGlob: framework.pagePattern,
      }
      const wrapperCode = generateWrapperCode(framework.providers)
      await initPreview(resolved.cwd, config, wrapperCode)
    }

    // Step 5: Generate MVC files
    console.log(chalk.dim('\nGenerating preview artifacts...'))
    const config = await readConfig(resolved.cwd)
    if (!options.llm) {
      config.llm = { ...config.llm, provider: 'none' }
    }
    const result = await generateAll(resolved.cwd, config)
    console.log(chalk.green(`  ${result.screensFound} screens found, ${result.adaptersGenerated} adapters generated`))

    // Step 6: Start dev server
    if (options.port) {
      config.port = parseInt(options.port, 10)
    }
    await generateEntryFiles(resolved.cwd, config)
    const viteConfig = await createViteConfig(resolved.cwd, config)

    const require = createRequire(join(resolved.cwd, 'package.json'))
    const vite = require('vite') as {
      createServer: (config: Record<string, unknown>) => Promise<{
        listen: () => Promise<void>
        config: { server: { port?: number } }
      }>
    }

    const server = await vite.createServer(viteConfig)
    await server.listen()

    const actualPort = server.config.server.port ?? config.port
    console.log('')
    console.log(chalk.green('  Preview ready at:'))
    console.log(chalk.cyan(`  http://localhost:${actualPort}`))
    console.log('')
    console.log(chalk.dim('  Press Ctrl+C to stop'))

    // Cleanup temp directory on exit
    if (resolved.tempDir) {
      const cleanup = async () => {
        console.log(chalk.dim('\nCleaning up temp directory...'))
        await rm(resolved.tempDir!, { recursive: true, force: true })
      }
      process.on('SIGINT', async () => { await cleanup(); process.exit(0) })
      process.on('SIGTERM', async () => { await cleanup(); process.exit(0) })
    }
  })

function detectPackageManager(cwd: string): string {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(cwd, 'bun.lockb'))) return 'bun'
  return 'npm'
}
```

**Step 3: Register in CLI entry point**

```typescript
// packages/cli/src/index.ts — add import and register
import { previewCommand } from './commands/preview.js'

// Add as default command (before program.parse())
program.addCommand(previewCommand, { isDefault: false })
```

Also make the source argument work as the default positional arg on the program itself:

```typescript
program
  .name('preview')
  .description('Screen preview tool for React projects')
  .version('0.0.1')
  .argument('[source]', 'Path or URL to preview (shortcut for `preview preview <source>`)')
  .action(async (source?: string) => {
    if (source) {
      // Delegate to preview command
      await program.parseAsync(['node', 'preview', 'preview', source, ...process.argv.slice(3)])
    }
  })
```

**Step 4: Run existing tests to verify nothing broke**

Run: `cd packages/cli && npx vitest run`
Expected: All existing tests PASS

**Step 5: Commit**

```bash
git add packages/cli/src/commands/preview.ts packages/cli/src/commands/init.ts packages/cli/src/index.ts
git commit -m "feat(cli): add combined preview command for external apps"
```

---

## Task 5: Discovery Enhancement for External Apps

The current `discover.ts` only processes `index.tsx` files and skips standalone `.tsx` files that start with uppercase. For external apps (like the booking app with `home.tsx`, `login.tsx`), standalone `.tsx` files ARE pages.

**Files:**
- Modify: `packages/cli/src/analyzer/discover.ts:28-41` — relax the filter for non-index files

**Step 1: Write a test for standalone page discovery**

```typescript
// packages/cli/src/analyzer/__tests__/discover.test.ts
import { describe, it, expect } from 'vitest'
import { discoverScreens } from '../discover.js'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('discoverScreens for external apps', () => {
  it('discovers standalone .tsx files in src/pages/', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'home.tsx'), 'export default function Home() { return <div>Home</div> }')
    await writeFile(join(dir, 'src', 'pages', 'login.tsx'), 'export default function Login() { return <div>Login</div> }')

    const screens = await discoverScreens(dir, 'src/pages/**/*.tsx')

    expect(screens).toHaveLength(2)
    expect(screens.map(s => s.route).sort()).toEqual(['/', '/login'].sort())
  })

  it('discovers admin/ subdirectory pages', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await mkdir(join(dir, 'src', 'pages', 'admin'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'admin', 'dashboard.tsx'), 'export default function Dashboard() { return <div>Dashboard</div> }')
    await writeFile(join(dir, 'src', 'pages', 'admin', 'services.tsx'), 'export default function Services() { return <div>Services</div> }')

    const screens = await discoverScreens(dir, 'src/pages/**/*.tsx')

    expect(screens).toHaveLength(2)
    expect(screens.map(s => s.route).sort()).toEqual(['/admin/dashboard', '/admin/services'].sort())
  })

  it('derives route / for home.tsx', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'home.tsx'), 'export default function Home() {}')

    const screens = await discoverScreens(dir, 'src/pages/**/*.tsx')

    expect(screens[0].route).toBe('/')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/discover.test.ts`
Expected: FAIL — home.tsx gets filtered out because `h` is lowercase but the current logic has issues with standalone files

**Step 3: Fix the discovery logic**

In `packages/cli/src/analyzer/discover.ts`, update the filter at lines 28-41:

Replace the current standalone file filter block with:

```typescript
    // For non-index files, check if they look like pages
    if (!match.endsWith('/index.tsx') && !match.endsWith('index.tsx')) {
      const fileName = parts[parts.length - 1]
      if (!fileName) continue
      if (!fileName.endsWith('.tsx')) continue

      // Skip known non-page files
      const baseName = fileName.replace('.tsx', '')
      const skipFiles = ['App', 'main', 'layout', 'routes', 'router']
      if (skipFiles.includes(baseName)) continue

      // Skip files in component directories (not page directories)
      const parentDir = parts[parts.length - 2] ?? ''
      const componentDirs = ['components', 'ui', 'hooks', 'lib', 'utils', 'stores', 'types']
      if (componentDirs.includes(parentDir)) continue
    }
```

Also update `deriveRoute` to map `home` to `/`:

```typescript
function deriveRoute(cwd: string, filePath: string): string {
  // ... existing prefix stripping ...

  // Remove /index.tsx or .tsx suffix
  route = route.replace(/\/index\.tsx$/, '').replace(/\.tsx$/, '')

  // Map 'home' to root
  if (route === 'home' || route === '/home') {
    route = '/'
  }

  // Ensure leading slash
  if (!route.startsWith('/')) {
    route = '/' + route
  }

  return route
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/discover.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/analyzer/discover.ts packages/cli/src/analyzer/__tests__/discover.test.ts
git commit -m "feat(cli): improve discovery for external app standalone page files"
```

---

## Task 6: Dependency Installation for Remote Sources

When cloning a GitHub repo, ensure dependencies are installed before running the pipeline. Also handle the case where the host project needs `vite` and `@vitejs/plugin-react` available.

**Files:**
- Modify: `packages/cli/src/commands/preview.ts` — add dependency check
- Create: `packages/cli/src/resolver/install-deps.ts`

**Step 1: Create dependency installer**

```typescript
// packages/cli/src/resolver/install-deps.ts
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import chalk from 'chalk'

export function detectPackageManager(cwd: string): 'pnpm' | 'yarn' | 'bun' | 'npm' {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(cwd, 'bun.lockb'))) return 'bun'
  return 'npm'
}

export function installDependencies(cwd: string): void {
  const pm = detectPackageManager(cwd)
  console.log(chalk.dim(`  Installing with ${pm}...`))
  execSync(`${pm} install`, { cwd, stdio: 'pipe' })
}

export function ensureNodeModules(cwd: string): boolean {
  return existsSync(join(cwd, 'node_modules'))
}
```

**Step 2: Update preview command to use it**

Replace the inline `detectPackageManager` and install logic in `preview.ts` with imports from `install-deps.ts`.

**Step 3: Commit**

```bash
git add packages/cli/src/resolver/install-deps.ts packages/cli/src/commands/preview.ts
git commit -m "feat(cli): add dependency installation for remote sources"
```

---

## Task 7: Integration Test with Booking App

End-to-end test that runs the preview pipeline against the actual booking app.

**Files:**
- Create: `packages/cli/src/__tests__/integration/booking-app.test.ts`

**Step 1: Write integration test**

```typescript
// packages/cli/src/__tests__/integration/booking-app.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { resolveSource } from '../../resolver/resolve-source.js'
import { detectFramework } from '../../resolver/detect-framework.js'
import { generateWrapperCode } from '../../resolver/generate-wrapper.js'
import { discoverScreens } from '../../analyzer/discover.js'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const BOOKING_APP = join(process.env.HOME ?? '', 'Desktop/booking/client')
const skipIfNoBookingApp = existsSync(BOOKING_APP) ? describe : describe.skip

skipIfNoBookingApp('booking app integration', () => {
  it('resolves local path', async () => {
    const resolved = await resolveSource(BOOKING_APP)
    expect(resolved.isRemote).toBe(false)
    expect(resolved.cwd).toBe(BOOKING_APP)
  })

  it('detects React + Vite', async () => {
    const framework = await detectFramework(BOOKING_APP)
    expect(framework.name).toBe('react')
    expect(framework.bundler).toBe('vite')
  })

  it('detects providers', async () => {
    const framework = await detectFramework(BOOKING_APP)
    expect(framework.providers).toContain('@tanstack/react-query')
    expect(framework.providers).toContain('react-router-dom')
    expect(framework.providers).toContain('react-i18next')
  })

  it('detects page pattern', async () => {
    const framework = await detectFramework(BOOKING_APP)
    expect(framework.pagePattern).toBe('src/pages/**/*.tsx')
  })

  it('discovers all 9 screens', async () => {
    const framework = await detectFramework(BOOKING_APP)
    const screens = await discoverScreens(BOOKING_APP, framework.pagePattern)
    expect(screens.length).toBeGreaterThanOrEqual(9)
  })

  it('generates wrapper with detected providers', async () => {
    const framework = await detectFramework(BOOKING_APP)
    const code = generateWrapperCode(framework.providers)
    expect(code).toContain('QueryClientProvider')
    expect(code).toContain('MemoryRouter')
    expect(code).toContain('I18nextProvider')
  })
})
```

**Step 2: Run integration test**

Run: `cd packages/cli && npx vitest run src/__tests__/integration/booking-app.test.ts`
Expected: All tests PASS (skipped if booking app not present)

**Step 3: Commit**

```bash
git add packages/cli/src/__tests__/integration/booking-app.test.ts
git commit -m "test(cli): add integration tests for booking app preview"
```

---

## Task 8: CLI Build & Manual End-to-End Verification

Build the CLI and run it against the booking app to verify the full flow works.

**Step 1: Build the CLI**

Run: `cd packages/cli && pnpm build`
Expected: TypeScript compiles successfully

**Step 2: Run against booking app**

Run: `cd ~/Desktop/booking/client && node /path/to/packages/cli/dist/index.js preview . --no-llm`
Expected: Output shows framework detection, screen discovery, MVC generation, and dev server URL

**Step 3: Verify generated files**

Check that `~/Desktop/booking/client/.preview/` contains:
- `preview.config.json` with `screenGlob: "src/pages/**/*.tsx"`
- `wrapper.tsx` with QueryClientProvider, MemoryRouter, I18nextProvider
- `screens/` directory with one folder per screen
- Each folder has `view.ts`, `model.ts`, `controller.ts`, `adapter.ts`

**Step 4: Open browser and verify**

Open `http://localhost:6100` and verify:
- CatalogPanel shows all 9 screens
- Clicking a screen renders the booking app's component
- InspectorPanel shows detected regions
- Device frame switching works

**Step 5: Clean up booking app .preview/ if not keeping**

Run: `rm -rf ~/Desktop/booking/client/.preview`

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat(cli): complete external app preview support"
```

---

## Summary of All Tasks

| Task | Description | Estimate |
|------|-------------|----------|
| 1 | Source resolver (local + GitHub URL) | Small |
| 2 | Framework detector (deps + structure) | Small |
| 3 | Wrapper generator (auto-detect providers) | Small |
| 4 | Combined `preview` command | Medium |
| 5 | Discovery enhancement for standalone pages | Small |
| 6 | Dependency installation for remote sources | Small |
| 7 | Integration test with booking app | Small |
| 8 | Build & manual end-to-end verification | Small |

**Total new files:** 7 source + 4 test files
**Modified files:** 3 (index.ts, init.ts, discover.ts)
**Runtime package changes:** None
