import { describe, it, expect } from 'vitest'
import { transformUseState } from '../vite-plugin-preview-state.js'

describe('transformUseState (AST-based)', () => {
  it('transforms basic useState', () => {
    const code = `
import { useState } from 'react'
function Page() {
  const [count, setCount] = useState(0)
  return <div>{count}</div>
}
`
    const result = transformUseState(code, 'Page.tsx')
    expect(result).not.toBeNull()
    expect(result).toContain("usePreviewState('count', 0)")
    expect(result).toContain('usePreviewState')
    expect(result).toContain('@preview-tool/runtime')
  })

  it('transforms useState with generic type', () => {
    const code = `
import { useState } from 'react'
function Page() {
  const [items, setItems] = useState<string[]>([])
  return <div />
}
`
    const result = transformUseState(code, 'Page.tsx')
    expect(result).not.toBeNull()
    expect(result).toContain("usePreviewState<string[]>('items', [])")
  })

  it('preserves other React imports (useCallback, useEffect, useRef)', () => {
    const code = `
import { useState, useCallback, useEffect, useRef } from 'react'
function Page() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const cb = useCallback(() => {}, [])
  useEffect(() => {}, [])
  return <div />
}
`
    const result = transformUseState(code, 'Page.tsx')
    expect(result).not.toBeNull()
    expect(result).toContain('useCallback')
    expect(result).toContain('useEffect')
    expect(result).toContain('useRef')
    // useState import should still be there (usePreviewState wraps it internally)
    expect(result).toContain("usePreviewState('open', false)")
  })

  it('transforms multiple useState calls', () => {
    const code = `
import { useState } from 'react'
function Page() {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  return <div />
}
`
    const result = transformUseState(code, 'Page.tsx')
    expect(result).not.toBeNull()
    expect(result).toContain("usePreviewState('name', '')")
    expect(result).toContain("usePreviewState('loading', true)")
    expect(result).toContain("usePreviewState<string | null>('error', null)")
  })

  it('returns null when no useState calls', () => {
    const code = `
import { useEffect } from 'react'
function Page() {
  useEffect(() => {}, [])
  return <div />
}
`
    const result = transformUseState(code, 'Page.tsx')
    expect(result).toBeNull()
  })

  it('does not transform non-destructured useState', () => {
    const code = `
import { useState } from 'react'
function Page() {
  const state = useState(0)
  return <div />
}
`
    const result = transformUseState(code, 'Page.tsx')
    expect(result).toBeNull()
  })

  it('handles complex initial values', () => {
    const code = `
import { useState } from 'react'
function Page() {
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
  })
  return <div />
}
`
    const result = transformUseState(code, 'Page.tsx')
    expect(result).not.toBeNull()
    expect(result).toContain("usePreviewState<LoginFormData>('formData',")
    expect(result).toContain("email: ''")
  })

  it('transforms aliased useState import', () => {
    const code = `
import { useState as useLocalState } from 'react'
function Comp() {
  const [count, setCount] = useLocalState(0)
  return null
}
`
    const result = transformUseState(code, 'comp.tsx')
    expect(result).not.toBeNull()
    expect(result).toContain("usePreviewState('count', 0)")
  })

  it('preserves generic type parameter from useState<T>', () => {
    const code = `
import { useState } from 'react'
function Comp() {
  const [open, setOpen] = useState<boolean>(false)
  return null
}
`
    const result = transformUseState(code, 'comp.tsx')
    expect(result).not.toBeNull()
    expect(result).toContain("usePreviewState<boolean>('open', false)")
  })
})
