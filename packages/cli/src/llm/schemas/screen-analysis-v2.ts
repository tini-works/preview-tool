import { z } from 'zod'

const RegionSourceSchema = z.object({
  type: z.enum(['hook', 'useState', 'useSearchParams', 'prop']),
  name: z.string().min(1),
  importPath: z.string().optional(),
})

const RegionStateSchema = z.object({
  label: z.string().min(1),
  mockData: z.unknown(),
})

const RegionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['list', 'detail', 'form', 'status', 'auth', 'media', 'custom']),
  source: RegionSourceSchema,
  states: z.record(z.string(), RegionStateSchema),
})

/** Coerce non-string values (objects/arrays the LLM may return) into a string. */
const coerceString = z.unknown().transform((val) =>
  typeof val === 'string' ? val : JSON.stringify(val),
)

/** Like coerceString but allows null/undefined → undefined (for optional fields). */
const coerceStringOptional = z.unknown().transform((val) =>
  val == null ? undefined : typeof val === 'string' ? val : JSON.stringify(val),
)

const FlowSchema = z.object({
  trigger: coerceString,
  action: z.enum(['navigate', 'setState', 'setRegionState']),
  from: coerceStringOptional,
  to: coerceString,
})

const HookRoleEnum = z.enum([
  'data_fetcher',
  'mutation',
  'realtime',
  'state_store',
  'side_effect',
  'ui_utility',
  'context',
])

const MockModuleSchema = z.object({
  hookName: z.string().min(1),
  importPath: z.string().min(1),
  role: HookRoleEnum,
  defaultState: z.string().min(1),
  stateMap: z.record(z.string(), z.unknown()),
})

export const ScreenAnalysisV2Schema = z.object({
  regions: z.array(RegionSchema),
  flows: z.array(FlowSchema),
  mockModules: z.array(MockModuleSchema),
})

export type ScreenAnalysisV2 = z.infer<typeof ScreenAnalysisV2Schema>
export type RegionV2 = z.infer<typeof RegionSchema>
export type HookRole = z.infer<typeof HookRoleEnum>
export type MockModuleV2 = z.infer<typeof MockModuleSchema>
