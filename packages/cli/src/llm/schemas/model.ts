import { z } from 'zod'

const HookMappingSchema = z.object({
  type: z.enum(['query-hook', 'custom-hook', 'store', 'context', 'prop', 'local-state', 'unknown']),
  hookName: z.string(),
  identifier: z.string(),
  importPath: z.string(),
}).optional()

export const ComponentRegionSchema = z.object({
  label: z.string(),
  component: z.string(),
  componentPath: z.string(),
  states: z.record(z.string(), z.record(z.string(), z.unknown())),
  defaultState: z.string(),
  isList: z.boolean().optional(),
  mockItems: z.array(z.unknown()).optional(),
  defaultCount: z.number().optional(),
  hookMapping: HookMappingSchema,
})

export const ModelOutputSchema = z.object({
  regions: z.record(z.string(), ComponentRegionSchema),
})

export type ValidatedModelOutput = z.infer<typeof ModelOutputSchema>
