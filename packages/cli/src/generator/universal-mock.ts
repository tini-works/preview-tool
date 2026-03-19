// packages/cli/src/generator/universal-mock.ts

export interface UniversalMockOptions {
  hookName: string
  regionKey: string
  importPath: string
  isBarrel: boolean
  hasStaticGetState: boolean
  returnStyle: 'object' | 'tuple'
}

export function generateUniversalMock(options: UniversalMockOptions): string {
  const { hookName, regionKey, importPath, isBarrel, hasStaticGetState, returnStyle } = options

  const lines: string[] = [
    `// Auto-generated universal mock for ${importPath}`,
  ]

  // Re-export non-mocked names from the real module
  if (!isBarrel) {
    lines.push(`export * from '__real:${importPath}'`)
  }

  lines.push(
    '',
    "import { useRegionDataForHook } from '@preview-tool/runtime'",
    '',
    '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
    'const NOOP = (() => {}) as any',
    '',
  )

  if (returnStyle === 'tuple') {
    lines.push(
      '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
      `export function ${hookName}(..._args: any[]) {`,
      `  const data = useRegionDataForHook('${regionKey}') ?? {}`,
      '  return [data, NOOP] as const',
      '}',
    )
  } else {
    lines.push(
      '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
      `export function ${hookName}(..._args: any[]) {`,
      `  const data = useRegionDataForHook('${regionKey}') ?? {}`,
      '  const proxied = new Proxy(data as any, {',
      '    get(t, k) {',
      '      if (typeof k === "symbol") return t[k]',
      '      if (k in t) return t[k]',
      '      return undefined',
      '    }',
      '  })',
      '  // Zustand selector pattern: useStore((s) => s.field)',
      '  if (typeof _args[0] === "function") {',
      '    try {',
      '      const selectorProxy = new Proxy(data as any, {',
      '        get(t, k) { return (typeof k === "symbol" || k in t) ? t[k] : NOOP }',
      '      })',
      '      return _args[0](selectorProxy)',
      '    } catch { return proxied }',
      '  }',
      '  return proxied',
      '}',
    )
  }

  // Static methods (Zustand .getState() etc.)
  if (hasStaticGetState) {
    lines.push(
      '',
      '// Zustand static methods',
      `${hookName}.getState = () => useRegionDataForHook('${regionKey}') ?? {}`,
      `${hookName}.setState = NOOP`,
      `${hookName}.subscribe = () => NOOP`,
    )
  }

  return lines.join('\n') + '\n'
}
