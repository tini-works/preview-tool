import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdir, rm } from 'node:fs/promises'
import { TypeCache, hashContent } from '../type-cache.js'
import type { TypeShapeInfo } from '../../analyzer/types.js'

const CACHE_DIR = join('/tmp', 'preview-type-cache-test')

describe('TypeCache', () => {
  let cache: TypeCache

  beforeEach(async () => {
    await mkdir(CACHE_DIR, { recursive: true })
    cache = new TypeCache(CACHE_DIR)
  })

  afterEach(async () => {
    await rm(CACHE_DIR, { recursive: true, force: true })
  })

  it('returns null for uncached screen', async () => {
    const result = await cache.get('scr-home', 'abc123')
    expect(result).toBeNull()
  })

  it('stores and retrieves cached data', async () => {
    const data: Record<string, TypeShapeInfo> = {
      useRooms: {
        shape: { rooms: [] },
        confidence: 'full',
        methods: [],
        properties: ['rooms'],
      },
    }
    await cache.set('scr-home', 'abc123', data)
    const result = await cache.get('scr-home', 'abc123')
    expect(result).toEqual(data)
  })

  it('returns null when source hash differs (stale cache)', async () => {
    const data: Record<string, TypeShapeInfo> = {
      useRooms: {
        shape: { rooms: [] },
        confidence: 'full',
        methods: [],
        properties: ['rooms'],
      },
    }
    await cache.set('scr-home', 'abc123', data)
    const result = await cache.get('scr-home', 'different-hash')
    expect(result).toBeNull()
  })
})

describe('hashContent', () => {
  it('returns a 16-char hex string', () => {
    const hash = hashContent('hello world')
    expect(hash).toMatch(/^[a-f0-9]{16}$/)
  })

  it('returns different hashes for different content', () => {
    expect(hashContent('hello')).not.toBe(hashContent('world'))
  })

  it('returns same hash for same content', () => {
    expect(hashContent('hello')).toBe(hashContent('hello'))
  })
})
