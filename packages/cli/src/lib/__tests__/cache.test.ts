import { describe, it, expect, beforeEach } from 'vitest'
import { AnalysisCache } from '../cache.js'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('AnalysisCache', () => {
  let cacheDir: string
  let cache: AnalysisCache

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'cache-'))
    cache = new AnalysisCache(cacheDir)
  })

  it('returns null for uncached keys', async () => {
    const result = await cache.get('nonexistent', 'abc123')
    expect(result).toBeNull()
  })

  it('stores and retrieves cached data', async () => {
    const data = { regions: [], flows: [], mockModules: [] }
    await cache.set('screen-a', 'hash123', data)
    const result = await cache.get('screen-a', 'hash123')
    expect(result).toEqual(data)
  })

  it('returns null when hash does not match', async () => {
    const data = { regions: [] }
    await cache.set('screen-a', 'hash123', data)
    const result = await cache.get('screen-a', 'hash456')
    expect(result).toBeNull()
  })

  it('computes content hash deterministically', () => {
    const hash1 = AnalysisCache.contentHash('hello world')
    const hash2 = AnalysisCache.contentHash('hello world')
    const hash3 = AnalysisCache.contentHash('hello world!')
    expect(hash1).toBe(hash2)
    expect(hash1).not.toBe(hash3)
  })
})
