import { readFile, readdir, access } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import {
  SpecScreenSchema,
  SpecFlowSchema,
  SpecCodeMapSchema,
  type SpecManifest,
  type SpecManifestScreen,
  type SpecManifestFlow,
  type SpecCodeMap,
} from './types.js'

function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null
  try {
    return parseYaml(match[1]) as Record<string, unknown>
  } catch {
    return null
  }
}

async function dirExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function loadMarkdownFiles(dir: string): Promise<Record<string, unknown>[]> {
  if (!(await dirExists(dir))) return []

  const entries = await readdir(dir)
  const results: Record<string, unknown>[] = []

  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue
    const content = await readFile(join(dir, entry), 'utf-8')
    const fm = parseFrontmatter(content)
    if (fm && fm.id) results.push(fm)
  }

  return results
}

async function loadCodeMap(specsDir: string): Promise<SpecCodeMap> {
  const codemapPath = join(specsDir, 'code-map.yaml')
  if (!(await dirExists(codemapPath))) return {}

  try {
    const content = await readFile(codemapPath, 'utf-8')
    const raw = parseYaml(content)
    if (!raw || typeof raw !== 'object') return {}
    return SpecCodeMapSchema.parse(raw)
  } catch {
    return {}
  }
}

function resolveSourceFile(
  screenId: string,
  codeMap: SpecCodeMap
): string | null {
  const entry = codeMap[screenId]
  if (!entry) return null

  if (Array.isArray(entry)) {
    return entry[0] ?? null
  }

  if (typeof entry === 'object') {
    const route = entry['route']
    if (typeof route === 'string') return route
    const components = entry['components']
    if (Array.isArray(components) && components.length > 0) {
      return components[0] as string
    }
  }

  return null
}

function getStateName(state: Record<string, unknown>): string {
  return (state.name as string) ?? (state.id as string) ?? 'unknown'
}

export async function loadSpecs(specsDir: string): Promise<SpecManifest> {
  if (!(await dirExists(specsDir))) {
    return { screens: [], flows: [] }
  }

  const [rawScreens, rawFlows, codeMap] = await Promise.all([
    loadMarkdownFiles(join(specsDir, 'screens')),
    loadMarkdownFiles(join(specsDir, 'flows')),
    loadCodeMap(specsDir),
  ])

  const screens: SpecManifestScreen[] = []
  for (const raw of rawScreens) {
    const parsed = SpecScreenSchema.safeParse(raw)
    if (!parsed.success) continue

    const screen = parsed.data
    const stateNames = screen.states.map(getStateName)
    const stateData: Record<string, Record<string, unknown>> = {}
    for (const state of screen.states) {
      const name = getStateName(state)
      stateData[name] = (state.mockData as Record<string, unknown>) ?? {}
    }

    screens.push({
      id: screen.id,
      title: screen.title ?? screen.id,
      sourceFile: resolveSourceFile(screen.id, codeMap),
      states: stateNames,
      defaultState: stateNames[0] ?? null,
      stateData,
      dataDeps: screen.data_deps,
      routeParams: screen.route_params ?? null,
    })
  }

  const flows: SpecManifestFlow[] = []
  for (const raw of rawFlows) {
    const parsed = SpecFlowSchema.safeParse(raw)
    if (!parsed.success) continue

    const flow = parsed.data
    flows.push({
      id: flow.id,
      title: flow.title ?? flow.id,
      steps: flow.steps.map((s) => ({
        screen: s.screen,
        entryState: s.entry_state,
      })),
      branches: flow.branches.map((b) => ({
        atStep: b.at_step,
        action: b.action,
        resumeStep: b.resume_step,
      })),
    })
  }

  return { screens, flows }
}
