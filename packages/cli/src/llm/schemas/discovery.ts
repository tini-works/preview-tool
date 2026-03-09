import { z } from 'zod'

export const DiscoveredScreenSchema = z.object({
  filePath: z.string().min(1),
  route: z.string().min(1),
  screenName: z.string().min(1),
})

export const DiscoveryOutputSchema = z.object({
  screens: z.array(DiscoveredScreenSchema),
})

export type DiscoveryOutput = z.infer<typeof DiscoveryOutputSchema>
export type LLMDiscoveredScreen = z.infer<typeof DiscoveredScreenSchema>
