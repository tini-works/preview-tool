import { describe, it, expect } from 'vitest'
import { createPreviewStatePlugin, transformUseState } from '../vite-plugin-preview-state.js'

describe('transformUseState', () => {
  it('transforms const [x, setX] = useState(false)', () => {
    const input = `import { useState } from 'react'\nconst [showPassword, setShowPassword] = useState(false)`
    const result = transformUseState(input)
    expect(result).toContain("usePreviewState('showPassword', false)")
    expect(result).not.toContain('useState(false)')
  })

  it('transforms useState with string initial value', () => {
    const input = `import { useState } from 'react'\nconst [name, setName] = useState('')`
    const result = transformUseState(input)
    expect(result).toContain("usePreviewState('name', '')")
  })

  it('transforms useState with object initial value', () => {
    const input = `import { useState } from 'react'\nconst [errors, setErrors] = useState({})`
    const result = transformUseState(input)
    expect(result).toContain("usePreviewState('errors', {})")
  })

  it('adds usePreviewState import when transformations made', () => {
    const input = `import { useState } from 'react'\nconst [show, setShow] = useState(false)`
    const result = transformUseState(input)
    expect(result).toContain("import { usePreviewState } from '@preview-tool/runtime'")
  })

  it('does not add import when no transformations made', () => {
    const input = `const x = 42`
    const result = transformUseState(input)
    expect(result).not.toContain('usePreviewState')
    expect(result).toBe(input)
  })

  it('handles multiple useState calls', () => {
    const input = [
      "import { useState } from 'react'",
      'const [a, setA] = useState(false)',
      'const [b, setB] = useState(0)',
    ].join('\n')
    const result = transformUseState(input)
    expect(result).toContain("usePreviewState('a', false)")
    expect(result).toContain("usePreviewState('b', 0)")
  })

  it('preserves React.useState pattern', () => {
    const input = `const [show, setShow] = React.useState(false)`
    const result = transformUseState(input)
    expect(result).toContain("usePreviewState('show', false)")
  })
})

describe('createPreviewStatePlugin', () => {
  it('returns a Vite plugin with transform hook', () => {
    const plugin = createPreviewStatePlugin(['/src/pages/Login.tsx'])
    expect(plugin.name).toBe('preview-state-transform')
    expect(plugin.enforce).toBe('pre')
    expect(typeof plugin.transform).toBe('function')
  })

  it('transforms matching screen files', () => {
    const plugin = createPreviewStatePlugin(['/src/pages/Login.tsx'])
    const input = `import { useState } from 'react'\nconst [show, setShow] = useState(false)`
    const result = (plugin.transform as Function)(input, '/src/pages/Login.tsx')
    expect(result).toBeDefined()
    expect(result.code).toContain('usePreviewState')
  })

  it('skips non-screen files', () => {
    const plugin = createPreviewStatePlugin(['/src/pages/Login.tsx'])
    const input = `import { useState } from 'react'\nconst [show, setShow] = useState(false)`
    const result = (plugin.transform as Function)(input, '/src/utils/helper.ts')
    expect(result).toBeUndefined()
  })
})
