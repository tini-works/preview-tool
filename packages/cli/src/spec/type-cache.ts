import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import type { TypeShapeInfo } from '../analyzer/types.js'

interface CacheEntry {
  sourceHash: string
  hooks: Record<string, TypeShapeInfo>
}

interface CacheFile {
  version: 1
  screens: Record<string, CacheEntry>
}

export class TypeCache {
  private readonly cachePath: string

  constructor(cacheDir: string) {
    this.cachePath = join(cacheDir, 'type-cache.json')
  }

  async get(
    screenId: string,
    sourceHash: string,
  ): Promise<Record<string, TypeShapeInfo> | null> {
    try {
      const raw = await readFile(this.cachePath, 'utf-8')
      const cache: CacheFile = JSON.parse(raw)
      const entry = cache.screens[screenId]
      if (!entry || entry.sourceHash !== sourceHash) return null
      return entry.hooks
    } catch {
      return null
    }
  }

  async set(
    screenId: string,
    sourceHash: string,
    hooks: Record<string, TypeShapeInfo>,
  ): Promise<void> {
    let cache: CacheFile
    try {
      const raw = await readFile(this.cachePath, 'utf-8')
      cache = JSON.parse(raw)
    } catch {
      cache = { version: 1, screens: {} }
    }

    cache.screens[screenId] = { sourceHash, hooks }

    await mkdir(dirname(this.cachePath), { recursive: true })
    await writeFile(this.cachePath, JSON.stringify(cache, null, 2), 'utf-8')
  }
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}
