import { existsSync, readFileSync, writeFileSync } from 'node:fs'

interface ProviderDef {
  dependency: string
  imports: string
  open: string | ((route?: string) => string)
  close: string
  setup?: string
}

const PROVIDER_DEFS: ProviderDef[] = [
  {
    dependency: '@tanstack/react-query',
    imports: "import { QueryClient, QueryClientProvider } from '@tanstack/react-query'",
    setup: 'const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })',
    open: '<QueryClientProvider client={queryClient}>',
    close: '</QueryClientProvider>',
  },
  {
    dependency: '@tanstack/react-router',
    imports: [
      "import { createRouter, createRootRoute, createMemoryHistory, RouterProvider } from '@tanstack/react-router'",
    ].join('\n'),
    setup: [
      'const rootRoute = createRootRoute({ component: ({ children }: { children?: ReactNode }) => <>{children}</> })',
      'const memoryHistory = createMemoryHistory({ initialEntries: ["/"] })',
      'const previewRouter = createRouter({ routeTree: rootRoute, history: memoryHistory })',
      'function TanStackRouterWrapper({ children }: { children: ReactNode }) {',
      '  return <><RouterProvider router={previewRouter} />{children}</>',
      '}',
    ].join('\n'),
    open: '<TanStackRouterWrapper>',
    close: '</TanStackRouterWrapper>',
  },
  {
    dependency: 'react-router-dom',
    imports: "import { MemoryRouter } from 'react-router-dom'",
    open: (route?: string) => {
      if (route) {
        const safeRoute = route.replace(/'/g, "\\'")
        return `<MemoryRouter initialEntries={['${safeRoute}']}>`
      }
      return '<MemoryRouter>'
    },
    close: '</MemoryRouter>',
  },
  {
    dependency: 'react-hook-form',
    imports: "import { FormProvider, useForm } from 'react-hook-form'",
    setup: 'const methods = useForm()',
    open: '<FormProvider {...methods}>',
    close: '</FormProvider>',
  },
  {
    dependency: 'react-i18next',
    imports: [
      "import { I18nextProvider } from 'react-i18next'",
      "import i18n from '@host/i18n'",
      "import { useEffect } from 'react'",
      "import { useDevToolsStore } from '@preview-tool/runtime'",
    ].join('\n'),
    setup: [
      'function I18nSyncWrapper({ children }: { children: ReactNode }) {',
      "  const language = useDevToolsStore((s) => s.language)",
      '  useEffect(() => { i18n.changeLanguage(language) }, [language])',
      '  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>',
      '}',
    ].join('\n'),
    open: '<I18nSyncWrapper>',
    close: '</I18nSyncWrapper>',
  },
  {
    dependency: '@chakra-ui/react',
    imports: "import { ChakraProvider } from '@chakra-ui/react'",
    open: '<ChakraProvider>',
    close: '</ChakraProvider>',
  },
  {
    dependency: '@mui/material',
    imports: "import { ThemeProvider, createTheme } from '@mui/material'",
    setup: 'const theme = createTheme()',
    open: '<ThemeProvider theme={theme}>',
    close: '</ThemeProvider>',
  },
  {
    dependency: '@reduxjs/toolkit',
    imports: [
      "import { Provider } from 'react-redux'",
      "import { configureStore } from '@reduxjs/toolkit'",
    ].join('\n'),
    setup: 'const previewStore = configureStore({ reducer: {} })',
    open: '<Provider store={previewStore}>',
    close: '</Provider>',
  },
  {
    dependency: 'recoil',
    imports: "import { RecoilRoot } from 'recoil'",
    open: '<RecoilRoot>',
    close: '</RecoilRoot>',
  },
  {
    dependency: 'jotai',
    imports: "import { Provider as JotaiProvider } from 'jotai'",
    open: '<JotaiProvider>',
    close: '</JotaiProvider>',
  },
  {
    dependency: 'styled-components',
    imports: "import { ThemeProvider as SCThemeProvider } from 'styled-components'",
    setup: 'const scTheme = {}',
    open: '<SCThemeProvider theme={scTheme}>',
    close: '</SCThemeProvider>',
  },
  {
    dependency: '@emotion/react',
    imports: "import { ThemeProvider as EmotionThemeProvider } from '@emotion/react'",
    setup: 'const emotionTheme = {}',
    open: '<EmotionThemeProvider theme={emotionTheme}>',
    close: '</EmotionThemeProvider>',
  },
]

export function generateWrapperCode(
  providers: string[],
  options: { route?: string; i18nPath?: string | null } = {},
): string {
  const route = options.route
  // Deduplicate routers — prefer TanStack Router if both detected
  let filteredProviders = [...providers]
  if (filteredProviders.includes('@tanstack/react-router') && filteredProviders.includes('react-router-dom')) {
    filteredProviders = filteredProviders.filter((p) => p !== 'react-router-dom')
  }
  const matched = PROVIDER_DEFS.filter((d) => filteredProviders.includes(d.dependency))

  const imports = [
    "import type { ReactNode } from 'react'",
    ...matched.map((m) => m.imports),
  ]

  const setups = matched
    .filter((m) => m.setup)
    .map((m) => m.setup)

  const indent = (level: number) => '  '.repeat(level)

  if (matched.length === 0) {
    return `${imports.join('\n')}

export function Wrapper({ children }: { children: ReactNode }) {
  return <>{children}</>
}
`
  }

  // Resolve open tags — some are functions that accept route
  const resolveOpen = (m: ProviderDef): string =>
    typeof m.open === 'function' ? m.open(route) : m.open

  // Build nested JSX
  let jsx = ''
  let depth = 2
  for (const m of matched) {
    jsx += `${indent(depth)}${resolveOpen(m)}\n`
    depth++
  }
  jsx += `${indent(depth)}{children}\n`
  for (const m of [...matched].reverse()) {
    depth--
    jsx += `${indent(depth)}${m.close}\n`
  }

  const setupBlock = setups.length > 0 ? `\n${setups.join('\n')}\n` : ''

  let code = `// Auto-generated by preview-tool — edit freely, this file is not overwritten on re-generate.
${imports.join('\n')}
${setupBlock}
export function Wrapper({ children }: { children: ReactNode }) {
  return (
${jsx.trimEnd()}
  )
}
`

  // Resolve i18n import to actual file path
  if (options.i18nPath) {
    const resolved = `@host/${options.i18nPath.replace(/^src\//, '').replace(/\.(ts|tsx)$/, '')}`
    code = code.replace("from '@host/i18n'", `from '${resolved}'`)
  }

  return code
}

export interface SyncResult {
  created: boolean
  missingProviders: string[]
}

export function syncWrapperProviders(wrapperPath: string, providers: string[]): SyncResult {
  const matched = PROVIDER_DEFS.filter((d) => providers.includes(d.dependency))

  if (!existsSync(wrapperPath)) {
    writeFileSync(wrapperPath, generateWrapperCode(providers), 'utf-8')
    return { created: true, missingProviders: [] }
  }

  const existing = readFileSync(wrapperPath, 'utf-8')
  const missing = matched.filter((def) => !existing.includes(def.dependency))

  // Never overwrite user-maintained file
  return { created: false, missingProviders: missing.map((d) => d.dependency) }
}
