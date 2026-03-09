import { z } from 'zod'

const RegionSourceSchema = z.object({
  type: z.enum(['hook', 'useState', 'useSearchParams', 'prop']),
  name: z.string().min(1),
  importPath: z.string().optional(),
})

const RegionStateSchema = z.object({
  label: z.string().min(1),
  mockData: z.record(z.string(), z.unknown()),
})

const RegionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['list', 'detail', 'form', 'status', 'auth', 'media', 'custom']),
  source: RegionSourceSchema,
  states: z.record(z.string(), RegionStateSchema),
})

const FlowSchema = z.object({
  trigger: z.string().min(1),
  action: z.enum(['navigate', 'setState', 'setRegionState']),
  from: z.string().optional(),
  to: z.string().min(1),
})

const MockModuleSchema = z.object({
  hookName: z.string().min(1),
  importPath: z.string().min(1),
  defaultState: z.string().min(1),
  stateMap: z.record(z.string(), z.record(z.string(), z.unknown())),
})

export const ScreenAnalysisV2Schema = z.object({
  regions: z.array(RegionSchema),
  flows: z.array(FlowSchema),
  mockModules: z.array(MockModuleSchema),
})

export type ScreenAnalysisV2 = z.infer<typeof ScreenAnalysisV2Schema>
export type RegionV2 = z.infer<typeof RegionSchema>
export type MockModuleV2 = z.infer<typeof MockModuleSchema>
