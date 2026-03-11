import { z } from 'zod'

// --- State ---

const SpecStateSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  mockData: z.record(z.string(), z.unknown()).optional(),
  transitions: z
    .array(
      z.object({
        action: z.string(),
        target: z.string(),
        guard: z.string().optional(),
      })
    )
    .optional(),
})

export type SpecState = z.infer<typeof SpecStateSchema>

// --- Data Dependency ---

const SpecDataDepSchema = z.object({
  hook: z.string(),
  module: z.string(),
  provides: z.array(z.string()),
})

export type SpecDataDep = z.infer<typeof SpecDataDepSchema>

// --- Screen ---

export const SpecScreenSchema = z.object({
  id: z.string(),
  type: z.literal('screen').optional(),
  parent: z.string().optional(),
  title: z.string().optional(),
  status: z.string().optional(),
  states: z.array(SpecStateSchema).default([]),
  data_deps: z.array(SpecDataDepSchema).default([]),
  route_params: z.record(z.string(), z.string()).optional(),
  capabilities: z.array(z.string()).optional(),
  conventions: z.array(z.string()).optional(),
})

export type SpecScreen = z.infer<typeof SpecScreenSchema>

// --- Flow ---

const SpecFlowStepSchema = z.object({
  screen: z.string(),
  entry_state: z.string().optional(),
  exit_action: z.string().optional(),
  exit_state: z.string().optional(),
})

const SpecFlowBranchSchema = z.object({
  at_step: z.number().optional(),
  action: z.string().optional(),
  resume_step: z.number().optional(),
  condition: z.string().optional(),
})

export const SpecFlowSchema = z.object({
  id: z.string(),
  type: z.literal('flow').optional(),
  parent: z.string().optional(),
  title: z.string().optional(),
  status: z.string().optional(),
  steps: z.array(SpecFlowStepSchema).default([]),
  branches: z.array(SpecFlowBranchSchema).default([]),
})

export type SpecFlow = z.infer<typeof SpecFlowSchema>

// --- Code Map ---
// Supports two formats:
// 1. Flat: { "scr-home": ["src/pages/Home.tsx"] }
// 2. Structured: { "scr-home": { route: "src/routes/index.tsx", components: [...] } }

const CodeMapEntrySchema = z.union([
  z.array(z.string()),
  z.record(z.string(), z.union([z.string(), z.array(z.string())])),
])

export const SpecCodeMapSchema = z.record(z.string(), CodeMapEntrySchema)

export type SpecCodeMap = z.infer<typeof SpecCodeMapSchema>

// --- Manifest (combined output) ---

export interface SpecManifestScreen {
  id: string
  title: string
  sourceFile: string | null
  states: string[]
  defaultState: string | null
  stateData: Record<string, Record<string, unknown>>
  dataDeps: SpecDataDep[]
  routeParams: Record<string, string> | null
}

export interface SpecManifestFlow {
  id: string
  title: string
  steps: Array<{ screen: string; entryState?: string }>
  branches: Array<{ atStep?: number; action?: string; resumeStep?: number }>
}

export interface SpecManifest {
  screens: SpecManifestScreen[]
  flows: SpecManifestFlow[]
}

export const SpecManifestSchema = z.object({
  screens: z.array(z.any()),
  flows: z.array(z.any()),
})
