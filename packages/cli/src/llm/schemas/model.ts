import { z } from 'zod'

export const ComponentRegionSchema = z.object({
  label: z.string(),
  component: z.string(),
  componentPath: z.string(),
  states: z.record(z.string(), z.record(z.string(), z.unknown())),
  defaultState: z.string(),
  isList: z.boolean().optional(),
  mockItems: z.array(z.unknown()).optional(),
  defaultCount: z.number().optional(),
})

export const ModelOutputSchema = z.object({
  regions: z.record(z.string(), ComponentRegionSchema),
})

export type ValidatedModelOutput = z.infer<typeof ModelOutputSchema>
