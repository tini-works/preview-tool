import { describe, it, expect, afterAll } from 'vitest'
import { isGitUrl, parseGitUrl, detectMonorepoPackage } from '../resolve-source.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

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

const TMP = join(import.meta.dirname, '__tmp_monorepo__')

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true })
})

function makeMonorepo(files: Record<string, string>): string {
  const dir = join(TMP, `mono-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
  mkdirSync(dir, { recursive: true })
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content, 'utf-8')
  }
  return dir
}

describe('detectMonorepoPackage', () => {
  it('detects pnpm workspace and finds React package', () => {
    const dir = makeMonorepo({
      'pnpm-workspace.yaml': 'packages:\n  - "packages/*"',
      'package.json': '{"name": "root", "private": true}',
      'packages/web/package.json': '{"name": "web", "dependencies": {"react": "^19.0.0", "react-dom": "^19.0.0"}}',
      'packages/web/src/App.tsx': 'export default function App() {}',
      'packages/server/package.json': '{"name": "server", "dependencies": {"express": "^4.0.0"}}',
      'packages/server/src/index.ts': 'console.log("server")',
    })
    const result = detectMonorepoPackage(dir)
    expect(result).toBe(join(dir, 'packages/web'))
  })

  it('detects npm/yarn workspaces from package.json', () => {
    const dir = makeMonorepo({
      'package.json': '{"name": "root", "private": true, "workspaces": ["packages/*"]}',
      'packages/client/package.json': '{"name": "client", "dependencies": {"react": "^18.0.0", "react-dom": "^18.0.0"}}',
      'packages/client/src/pages/Home.tsx': 'export default function Home() {}',
    })
    const result = detectMonorepoPackage(dir)
    expect(result).toBe(join(dir, 'packages/client'))
  })

  it('returns null for non-monorepo (has src/ directly)', () => {
    const dir = makeMonorepo({
      'package.json': '{"name": "app", "dependencies": {"react": "^19.0.0"}}',
      'src/App.tsx': 'export default function App() {}',
    })
    const result = detectMonorepoPackage(dir)
    expect(result).toBeNull()
  })

  it('returns null when no workspace package has react', () => {
    const dir = makeMonorepo({
      'pnpm-workspace.yaml': 'packages:\n  - "packages/*"',
      'package.json': '{"name": "root", "private": true}',
      'packages/server/package.json': '{"name": "server", "dependencies": {"express": "^4.0.0"}}',
      'packages/server/src/index.ts': 'console.log("server")',
    })
    const result = detectMonorepoPackage(dir)
    expect(result).toBeNull()
  })

  it('prefers package named web/client/app/frontend', () => {
    const dir = makeMonorepo({
      'pnpm-workspace.yaml': 'packages:\n  - "packages/*"',
      'package.json': '{"name": "root", "private": true}',
      'packages/web/package.json': '{"name": "@acme/web", "dependencies": {"react": "^19.0.0", "react-dom": "^19.0.0"}}',
      'packages/web/src/App.tsx': 'export default function App() {}',
      'packages/utils/package.json': '{"name": "@acme/utils", "dependencies": {"react": "^19.0.0", "react-dom": "^19.0.0"}}',
      'packages/utils/src/index.tsx': 'export const x = 1',
      'packages/utils/src/a.tsx': '',
      'packages/utils/src/b.tsx': '',
      'packages/utils/src/c.tsx': '',
    })
    const result = detectMonorepoPackage(dir)
    expect(result).toBe(join(dir, 'packages/web'))
  })

  it('handles flat workspace layout (client/ at root)', () => {
    const dir = makeMonorepo({
      'package.json': '{"name": "root", "private": true, "workspaces": ["client", "server"]}',
      'client/package.json': '{"name": "client", "dependencies": {"react": "^19.0.0", "react-dom": "^19.0.0"}}',
      'client/src/App.tsx': 'export default function App() {}',
      'server/package.json': '{"name": "server", "dependencies": {"express": "^4.0.0"}}',
    })
    const result = detectMonorepoPackage(dir)
    expect(result).toBe(join(dir, 'client'))
  })
})
