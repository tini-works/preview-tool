import { z } from 'zod'

export const ComponentTriggerSchema = z.object({
  selector: z.string(),
  text: z.string().optional(),
  ariaLabel: z.string().optional(),
  nth: z.number().optional(),
})

export const FlowActionV2Schema = z.object({
  trigger: ComponentTriggerSchema,
  navigate: z.string().optional(),
  navigateState: z.string().optional(),
  setRegionState: z
    .object({
      region: z.string(),
      state: z.string(),
    })
    .optional(),
})

export const ComponentStateMachineSchema = z.object({
  component: z.string(),
  states: z.array(z.string()),
  defaultState: z.string(),
  transitions: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      on: z.string(),
    }),
  ),
})

export const UserJourneySchema = z.object({
  name: z.string(),
  steps: z.array(
    z.object({
      action: z.string(),
      expectedState: z.string(),
    }),
  ),
})

export const ControllerOutputSchema = z.object({
  flows: z.array(FlowActionV2Schema),
  componentStates: z.record(z.string(), ComponentStateMachineSchema),
  journeys: z.array(UserJourneySchema),
})

export type ValidatedControllerOutput = z.infer<typeof ControllerOutputSchema>
