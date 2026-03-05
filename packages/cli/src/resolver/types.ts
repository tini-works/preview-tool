export interface ResolvedSource {
  cwd: string
  isRemote: boolean
  tempDir?: string
}

export interface ResolveOptions {
  path?: string
  keep?: boolean
}
