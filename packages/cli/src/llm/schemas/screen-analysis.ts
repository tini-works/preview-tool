import { z } from 'zod'

const RegionStateSchema = z.object({
  label: z.string(),
  mockData: z.record(z.string(), z.unknown()),
})

const RegionSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['list', 'detail', 'form', 'status', 'auth', 'media', 'custom']),
  hookBindings: z.array(z.string()),
  states: z.record(z.string(), RegionStateSchema),
  defaultState: z.string(),
  isList: z.boolean().optional(),
  mockItems: z.array(z.unknown()).optional(),
  defaultCount: z.number().optional(),
}).refine(
  (r) => Object.keys(r.states).length === 0 || r.defaultState in r.states,
  { message: 'defaultState must match a key in states' },
)

const FlowTriggerSchema = z.object({
  selector: z.string(),
  text: z.string().optional(),
  ariaLabel: z.string().optional(),
  nth: z.number().optional(),
})

const FlowSchema = z.object({
  trigger: FlowTriggerSchema,
  action: z.enum(['navigate', 'setState', 'setRegionState']),
  target: z.string(),
  targetRegion: z.string().optional(),
})

export const ScreenAnalysisSchema = z.object({
  route: z.string(),
  regions: z.array(RegionSchema),
  flows: z.array(FlowSchema),
})

export type ScreenAnalysisOutput = z.infer<typeof ScreenAnalysisSchema>
export type RegionOutput = z.infer<typeof RegionSchema>
export type FlowOutput = z.infer<typeof FlowSchema>
