import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadHostEnvDefines, findWorkspaceRoot } from '../create-vite-config.js'

let tmp: string
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'vite-test-')) })
afterEach(() => { rmSync(tmp, { recursive: true, force: true }) })

describe('loadHostEnvDefines', () => {
  it('returns empty object when no .env files', () => {
    expect(loadHostEnvDefines(tmp)).toEqual({})
  })

  it('reads VITE_* vars from .env', () => {
    writeFileSync(join(tmp, '.env'), 'VITE_API_URL=http://localhost:3001\nNOT_VITE=ignored\n')
    const defines = loadHostEnvDefines(tmp)
    expect(defines['import.meta.env.VITE_API_URL']).toBe('"http://localhost:3001"')
    expect(defines['import.meta.env.NOT_VITE']).toBeUndefined()
  })

  it('.env.local overrides .env', () => {
    writeFileSync(join(tmp, '.env'), 'VITE_API_URL=http://localhost:3001\n')
    writeFileSync(join(tmp, '.env.local'), 'VITE_API_URL=http://localhost:9999\n')
    const defines = loadHostEnvDefines(tmp)
    expect(defines['import.meta.env.VITE_API_URL']).toBe('"http://localhost:9999"')
  })

  it('handles missing .env files gracefully', () => {
    expect(() => loadHostEnvDefines('/nonexistent/path')).not.toThrow()
  })

  it('strips surrounding quotes from .env values', () => {
    writeFileSync(join(tmp, '.env'), 'VITE_API_URL="https://example.com"\nVITE_KEY=\'value\'\n')
    const defines = loadHostEnvDefines(tmp)
    expect(defines['import.meta.env.VITE_API_URL']).toBe('"https://example.com"')
    expect(defines['import.meta.env.VITE_KEY']).toBe('"value"')
  })
})

describe('findWorkspaceRoot', () => {
  it('returns null when no workspace root found', () => {
    // tmp is not inside any workspace
    expect(findWorkspaceRoot(tmp)).toBeNull()
  })

  it('finds workspace root with workspaces field', () => {
    const root = mkdtempSync(join(tmpdir(), 'ws-root-'))
    const pkg = join(root, 'packages', 'app')
    mkdirSync(pkg, { recursive: true })
    writeFileSync(join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }))
    expect(findWorkspaceRoot(pkg)).toBe(root)
    rmSync(root, { recursive: true, force: true })
  })
})
