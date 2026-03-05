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
