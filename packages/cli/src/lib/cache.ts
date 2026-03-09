import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

interface CacheEntry {
  hash: string
  data: unknown
  timestamp: number
}

export class AnalysisCache {
  private readonly dir: string

  constructor(cacheDir: string) {
    this.dir = cacheDir
  }

  static contentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16)
  }

  async get(key: string, expectedHash: string): Promise<unknown | null> {
    const filePath = join(this.dir, `${key}.json`)
    if (!existsSync(filePath)) return null

    try {
      const raw = await readFile(filePath, 'utf-8')
      const entry: CacheEntry = JSON.parse(raw)
      if (entry.hash !== expectedHash) return null
      return entry.data
    } catch {
      return null
    }
  }

  async set(key: string, hash: string, data: unknown): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    const entry: CacheEntry = { hash, data, timestamp: Date.now() }
    const filePath = join(this.dir, `${key}.json`)
    await writeFile(filePath, JSON.stringify(entry, null, 2))
  }
}
