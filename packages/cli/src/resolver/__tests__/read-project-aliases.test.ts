import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readProjectAliases } from '../read-project-aliases.js'

let tmp: string
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'alias-test-')) })
afterEach(() => { rmSync(tmp, { recursive: true, force: true }) })

function writeTsconfig(cwd: string, paths: Record<string, string[]>) {
  writeFileSync(join(cwd, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { paths }
  }))
}

describe('readProjectAliases', () => {
  it('returns empty array when no tsconfig.json', () => {
    expect(readProjectAliases('/does/not/exist')).toEqual([])
  })

  it('returns empty array when tsconfig has no paths', () => {
    writeFileSync(join(tmp, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }))
    expect(readProjectAliases(tmp)).toEqual([])
  })

  it('converts @/* path to Vite alias', () => {
    writeTsconfig(tmp, { '@/*': ['src/*'] })
    const aliases = readProjectAliases(tmp)
    expect(aliases).toHaveLength(1)
    expect(aliases[0].find).toBe('@/')
    expect(aliases[0].replacement).toBe(join(tmp, 'src') + '/')
  })

  it('converts bare @ alias (no wildcard)', () => {
    writeTsconfig(tmp, { '@': ['src'] })
    const aliases = readProjectAliases(tmp)
    expect(aliases[0].find).toBe('@')
    expect(aliases[0].replacement).toBe(join(tmp, 'src'))
  })

  it('converts multiple aliases', () => {
    writeTsconfig(tmp, {
      '@/*': ['src/*'],
      '~/*': ['src/*'],
      '@components/*': ['src/components/*'],
    })
    const aliases = readProjectAliases(tmp)
    expect(aliases).toHaveLength(3)
    const finds = aliases.map(a => a.find)
    expect(finds).toContain('@/')
    expect(finds).toContain('~/')
    expect(finds).toContain('@components/')
  })

  it('longer aliases sort before shorter ones', () => {
    writeTsconfig(tmp, {
      '@/*': ['src/*'],
      '@components/*': ['src/components/*'],
    })
    const aliases = readProjectAliases(tmp)
    const componentsIdx = aliases.findIndex(a => a.find === '@components/')
    const atIdx = aliases.findIndex(a => a.find === '@/')
    expect(componentsIdx).toBeLessThan(atIdx)
  })

  it('handles monorepo path: @company/* → packages/shared/*', () => {
    writeTsconfig(tmp, { '@company/*': ['packages/shared/*'] })
    const aliases = readProjectAliases(tmp)
    expect(aliases[0].replacement).toBe(join(tmp, 'packages/shared') + '/')
  })

  it('returns empty array when tsconfig.json is malformed JSON', () => {
    writeFileSync(join(tmp, 'tsconfig.json'), '{ broken json')
    expect(readProjectAliases(tmp)).toEqual([])
  })
})

describe('readProjectAliases — extends support', () => {
  it('follows extends to read base tsconfig paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'preview-aliases-'))
    writeFileSync(join(dir, 'tsconfig.base.json'), JSON.stringify({
      compilerOptions: { paths: { '@utils/*': ['./utils/*'] } }
    }))
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
      extends: './tsconfig.base.json',
      compilerOptions: {}
    }))
    const aliases = readProjectAliases(dir)
    expect(aliases.some(a => (a.find as string).startsWith('@utils'))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('child paths override base paths with same key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'preview-aliases-'))
    writeFileSync(join(dir, 'tsconfig.base.json'), JSON.stringify({
      compilerOptions: { paths: { '@/*': ['./base-src/*'] } }
    }))
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
      extends: './tsconfig.base.json',
      compilerOptions: { paths: { '@/*': ['./src/*'] } }
    }))
    const aliases = readProjectAliases(dir)
    const atAlias = aliases.find(a => (a.find as string) === '@/')
    expect(atAlias?.replacement).toContain('/src/')
    expect(atAlias?.replacement).not.toContain('base-src')
    rmSync(dir, { recursive: true, force: true })
  })

  it('does not throw or hang on circular extends', () => {
    const dir = mkdtempSync(join(tmpdir(), 'preview-aliases-'))
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
      extends: './tsconfig.json',
      compilerOptions: {}
    }))
    expect(() => readProjectAliases(dir)).not.toThrow()
    rmSync(dir, { recursive: true, force: true })
  })
})
