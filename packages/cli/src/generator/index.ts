import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import chalk from 'chalk'
import { discoverScreens } from '../analyzer/discover.js'
import { analyzeScreen } from '../analyzer/analyze-component.js'
import { analyzeViewTree } from '../analyzer/analyze-view.js'
import { generateViewFileContent } from './generate-view.js'
import { generateModelFileContent } from './generate-model.js'
import { generateControllerFileContent } from './generate-controller.js'
import { callLLM } from '../llm/index.js'
import { buildGenerateMCPrompt } from '../llm/prompts/generate-mc.js'
import { ModelOutputSchema } from '../llm/schemas/model.js'
import { ControllerOutputSchema } from '../llm/schemas/controller.js'
import type { PreviewConfig } from '../lib/config.js'
import { PREVIEW_DIR } from '../lib/config.js'
import { formatLabel } from '../lib/format-label.js'
import type {
  DiscoveredScreen,
  ViewTree,
  ModelOutput,
  ControllerOutput,
  PropDefinition,
} from '../analyzer/types.js'

export interface GenerateResult {
  screensFound: number
  viewsGenerated: number
  modelsGenerated: number
  controllersGenerated: number
  adaptersGenerated: number
  overridesSkipped: number
}

/**
 * Orchestrates the full MVC generation pipeline:
 *
 * 1. Discover screens via glob
 * 2. Build V (ViewTree) for each screen via static AST analysis
 * 3. Build M+C via LLM with heuristic fallback
 * 4. Write per-screen folder: .preview/screens/{safeName}/view.ts, model.ts, controller.ts, adapter.ts
 *
 * Override directory: .preview/overrides/{safeName}/ — if model.ts or controller.ts
 * exists there, LLM generation is skipped for that file.
 */
export async function generateAll(
  cwd: string,
  config: PreviewConfig
): Promise<GenerateResult> {
  const previewDir = join(cwd, PREVIEW_DIR)
  const screensDir = join(previewDir, 'screens')
  const overridesDir = join(previewDir, 'overrides')

  // Ensure output directories
  await mkdir(screensDir, { recursive: true })
  await mkdir(overridesDir, { recursive: true })

  // Step 1: Discover screens
  console.log(chalk.dim('Discovering screens...'))
  const screens = await discoverScreens(cwd, config.screenGlob)
  console.log(chalk.dim(`  Found ${screens.length} screen(s)`))

  if (screens.length === 0) {
    return {
      screensFound: 0,
      viewsGenerated: 0,
      modelsGenerated: 0,
      controllersGenerated: 0,
      adaptersGenerated: 0,
      overridesSkipped: 0,
    }
  }

  let viewsGenerated = 0
  let modelsGenerated = 0
  let controllersGenerated = 0
  let adaptersGenerated = 0
  let overridesSkipped = 0

  for (const screen of screens) {
    const safeName = routeToFolderName(screen.route)
    const screenOutDir = join(screensDir, safeName)
    const overrideScreenDir = join(overridesDir, safeName)

    await mkdir(screenOutDir, { recursive: true })

    console.log(chalk.dim(`  Processing: ${screen.route} (${screen.pattern})`))

    // Step 2: Build V — ViewTree via static AST analysis
    let viewTree: ViewTree | null = null
    try {
      viewTree = analyzeViewTree(screen)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(chalk.yellow(`    View analysis failed, using legacy fallback: ${message}`))
    }

    // Write view.ts
    if (viewTree) {
      const viewContent = generateViewFileContent(viewTree)
      await writeFile(join(screenOutDir, 'view.ts'), viewContent, 'utf-8')
      viewsGenerated++
    } else {
      // Write a minimal view.ts placeholder
      const placeholderView = buildPlaceholderView(screen)
      await writeFile(join(screenOutDir, 'view.ts'), placeholderView, 'utf-8')
      viewsGenerated++
    }

    // Step 3: Build M+C — LLM with heuristic fallback
    const hasModelOverride = existsSync(join(overrideScreenDir, 'model.ts'))
    const hasControllerOverride = existsSync(join(overrideScreenDir, 'controller.ts'))

    if (hasModelOverride) {
      console.log(chalk.dim(`    Override exists: overrides/${safeName}/model.ts`))
      overridesSkipped++
    }
    if (hasControllerOverride) {
      console.log(chalk.dim(`    Override exists: overrides/${safeName}/controller.ts`))
      overridesSkipped++
    }

    // Single LLM call per screen — shared by model and controller
    const needsModel = !hasModelOverride
    const needsController = !hasControllerOverride
    let llmResult: LLMResult = { model: null, controller: null }
    if ((needsModel || needsController) && viewTree && config.llm.provider !== 'none') {
      llmResult = await tryLLMGeneration(screen, viewTree, cwd, config)
    }

    // Generate model if no override
    if (needsModel) {
      const model = llmResult.model ?? buildHeuristicModel(screen, viewTree)
      const modelMeta = {
        route: screen.route,
        pattern: screen.pattern,
        filePath: relative(cwd, screen.filePath).split('\\').join('/'),
      }
      const modelContent = generateModelFileContent(model, modelMeta)
      await writeFile(join(screenOutDir, 'model.ts'), modelContent, 'utf-8')
      modelsGenerated++
    }

    // Generate controller if no override
    if (needsController) {
      const controller = llmResult.controller ?? buildHeuristicController(screen, viewTree)
      const controllerContent = generateControllerFileContent(controller)
      await writeFile(join(screenOutDir, 'controller.ts'), controllerContent, 'utf-8')
      controllersGenerated++
    }

    // Step 4: Write adapter.ts — always regenerated
    const adapterContent = buildAdapterContent(screen, screenOutDir)
    await writeFile(join(screenOutDir, 'adapter.ts'), adapterContent, 'utf-8')
    adaptersGenerated++
  }

  return {
    screensFound: screens.length,
    viewsGenerated,
    modelsGenerated,
    controllersGenerated,
    adaptersGenerated,
    overridesSkipped,
  }
}

// ---------------------------------------------------------------------------
// Build M+C via single LLM call per screen
// ---------------------------------------------------------------------------

interface LLMResult {
  model: ModelOutput | null
  controller: ControllerOutput | null
}

async function tryLLMGeneration(
  screen: DiscoveredScreen,
  viewTree: ViewTree,
  cwd: string,
  config: PreviewConfig,
): Promise<LLMResult> {
  const result: LLMResult = { model: null, controller: null }

  try {
    const sourceCode = await readFile(screen.filePath, 'utf-8')
    const userPrompt = buildGenerateMCPrompt(viewTree, sourceCode)

    const raw = await callLLM(userPrompt, config.llm, {
      temperature: 0.2,
      maxTokens: 8192,
      jsonMode: true,
    })

    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>

      // Validate model
      if (obj.model) {
        const parsed = ModelOutputSchema.safeParse(obj.model)
        if (parsed.success) {
          result.model = parsed.data
        } else {
          console.log(chalk.dim('    LLM model output failed validation, retrying...'))
          // Retry once with correction prompt
          const retryResult = await retryWithCorrection(obj, config, 'model', parsed.error)
          if (retryResult?.model) {
            result.model = retryResult.model
          } else {
            console.log(chalk.dim('    Retry failed, using heuristic for model'))
          }
        }
      }

      // Validate controller
      if (obj.controller) {
        const parsed = ControllerOutputSchema.safeParse(obj.controller)
        if (parsed.success) {
          result.controller = parsed.data
        } else {
          console.log(chalk.dim('    LLM controller output failed validation, retrying...'))
          const retryResult = await retryWithCorrection(obj, config, 'controller', parsed.error)
          if (retryResult?.controller) {
            result.controller = retryResult.controller
          } else {
            console.log(chalk.dim('    Retry failed, using heuristic for controller'))
          }
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(chalk.dim(`    LLM generation failed: ${message}`))
  }

  return result
}

async function retryWithCorrection(
  originalOutput: Record<string, unknown>,
  config: PreviewConfig,
  target: 'model' | 'controller',
  error: { message?: string; issues?: unknown[] },
): Promise<LLMResult | null> {
  try {
    const errorMessage = error.message ?? JSON.stringify(error.issues ?? [])
    const correctionPrompt = `Your previous output had a validation error in the "${target}" section.

Error: ${errorMessage}

Previous output:
${JSON.stringify(originalOutput[target], null, 2)}

Please fix the "${target}" section and return the corrected JSON. Return ONLY the top-level object with both "model" and "controller" keys.`

    const raw = await callLLM(correctionPrompt, config.llm, {
      temperature: 0.1,
      maxTokens: 8192,
      jsonMode: true,
    })

    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>
      const result: LLMResult = { model: null, controller: null }

      if (obj.model) {
        const parsed = ModelOutputSchema.safeParse(obj.model)
        if (parsed.success) result.model = parsed.data
      }
      if (obj.controller) {
        const parsed = ControllerOutputSchema.safeParse(obj.controller)
        if (parsed.success) result.controller = parsed.data
      }

      return result
    }
  } catch {
    // Retry failed silently — caller will use heuristic
  }

  return null
}

// ---------------------------------------------------------------------------
// Heuristic fallback: convert ViewTree dataProps to basic regions
// ---------------------------------------------------------------------------

function buildHeuristicModel(
  screen: DiscoveredScreen,
  viewTree: ViewTree | null,
): ModelOutput {
  const regions: ModelOutput['regions'] = {}

  if (viewTree && viewTree.dataProps.length > 0) {
    for (const prop of viewTree.dataProps) {
      const region = dataPropsToRegion(prop)
      if (region) {
        regions[region.key] = {
          label: region.label,
          component: 'Screen',
          componentPath: '',
          states: region.states,
          defaultState: region.defaultState,
          ...(region.isList ? { isList: true } : {}),
          ...(region.mockItems ? { mockItems: region.mockItems } : {}),
          ...(region.defaultCount ? { defaultCount: region.defaultCount } : {}),
        }
      }
    }
  } else {
    // Fall back to legacy analyzeScreen for non-ViewTree screens
    try {
      const analysis = analyzeScreen(screen)
      for (const [key, analyzedRegion] of Object.entries(analysis.regions)) {
        regions[key] = {
          label: analyzedRegion.label,
          component: 'Screen',
          componentPath: '',
          states: analyzedRegion.states,
          defaultState: analyzedRegion.defaultState,
          ...(analyzedRegion.isList ? { isList: true } : {}),
          ...(analyzedRegion.mockItems ? { mockItems: analyzedRegion.mockItems } : {}),
          ...(analyzedRegion.defaultCount ? { defaultCount: analyzedRegion.defaultCount } : {}),
        }
      }
    } catch {
      // Empty regions as last resort
    }
  }

  return { regions }
}

function buildHeuristicController(
  screen: DiscoveredScreen,
  viewTree: ViewTree | null,
): ControllerOutput {
  // Heuristic controller: extract flows from legacy analysis if available
  if (!viewTree) {
    try {
      const analysis = analyzeScreen(screen)
      return {
        flows: analysis.flows.map((flow) => ({
          trigger: {
            selector: 'button',
            text: flow.trigger,
          },
          ...(flow.navigate ? { navigate: flow.navigate } : {}),
        })),
        componentStates: {},
        journeys: [],
      }
    } catch {
      // Empty controller
    }
  }

  return {
    flows: [],
    componentStates: {},
    journeys: [],
  }
}

interface HeuristicRegion {
  key: string
  label: string
  states: Record<string, Record<string, unknown>>
  defaultState: string
  isList?: boolean
  mockItems?: unknown[]
  defaultCount?: number
}

function dataPropsToRegion(prop: PropDefinition): HeuristicRegion | null {
  const { name, type } = prop
  const label = formatLabel(name)

  // Boolean → toggle region
  if (type === 'boolean') {
    return {
      key: name,
      label,
      states: {
        enabled: { [name]: true },
        disabled: { [name]: false },
      },
      defaultState: 'enabled',
    }
  }

  // Array → list region
  if (type.endsWith('[]') || type.startsWith('Array<')) {
    return {
      key: name,
      label,
      states: {
        populated: { [name]: [{ id: '1' }, { id: '2' }, { id: '3' }] },
        empty: { [name]: [] },
      },
      defaultState: 'populated',
      isList: true,
      mockItems: Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1) })),
      defaultCount: 3,
    }
  }

  // Nullable/optional → present/absent region
  if (type.includes('null') || type.includes('undefined')) {
    return {
      key: name,
      label,
      states: {
        present: { [name]: `mock-${name}` },
        absent: { [name]: null },
      },
      defaultState: 'present',
    }
  }

  // String/number → single value region
  if (type === 'string' || type === 'number') {
    const value = type === 'string' ? `mock-${name}` : 42
    return {
      key: name,
      label,
      states: {
        default: { [name]: value },
      },
      defaultState: 'default',
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Adapter generation
// ---------------------------------------------------------------------------

function buildAdapterContent(
  screen: DiscoveredScreen,
  screenOutDir: string,
): string {
  const relativeToScreen = toRelativeImport(screenOutDir, screen.filePath)

  const lines: string[] = []
  lines.push('// Auto-generated by @preview-tool/cli — do not edit manually')

  if (screen.exportName) {
    lines.push(`import { ${screen.exportName} as Screen } from '${relativeToScreen}'`)
  } else {
    lines.push(`import Screen from '${relativeToScreen}'`)
  }

  lines.push("import { meta, regions } from './model'")
  lines.push("import { flows, componentStates, journeys } from './controller'")
  lines.push("import { view } from './view'")
  lines.push('')
  lines.push('export default Screen')
  lines.push('export { meta, regions, flows, componentStates, journeys, view }')
  lines.push('')

  return lines.join('\n')
}

function toRelativeImport(fromDir: string, toFile: string): string {
  let rel = relative(fromDir, toFile).split('\\').join('/')
  rel = rel.replace(/\.(tsx?)$/, '')
  if (!rel.startsWith('.')) {
    rel = './' + rel
  }
  return rel
}

// ---------------------------------------------------------------------------
// Placeholder view for when ViewTree analysis fails
// ---------------------------------------------------------------------------

function buildPlaceholderView(screen: DiscoveredScreen): string {
  const screenName = screen.exportName ?? deriveScreenName(screen.route)

  const viewTree = {
    screenName,
    filePath: screen.filePath,
    exportType: screen.exportName ? 'named' : 'default',
    ...(screen.exportName ? { exportName: screen.exportName } : {}),
    dataProps: [],
    tree: [],
  }

  return generateViewFileContent(viewTree as ViewTree)
}

function deriveScreenName(route: string): string {
  return route
    .replace(/^\//, '')
    .split('/')
    .map((s) =>
      s
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('')
    )
    .join('')
    || 'Screen'
}

// ---------------------------------------------------------------------------
// Route → folder name
// ---------------------------------------------------------------------------

/**
 * Converts a route like "/booking/time-slots" to a safe folder name "booking--time-slots"
 */
function routeToFolderName(route: string): string {
  return route
    .replace(/^\//, '')
    .replace(/\//g, '--')
    .replace(/[^a-zA-Z0-9\-_]/g, '_') || 'root'
}
