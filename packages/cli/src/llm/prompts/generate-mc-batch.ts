import type { ViewTree, DiscoveredScreen } from '../../analyzer/types.js'

export interface BatchScreenInput {
  id: string
  screen: DiscoveredScreen
  viewTree: ViewTree | null
}

export function buildBatchGenerateMCPrompt(
  screens: BatchScreenInput[],
  cwd: string,
): string {
  const screenManifest = screens
    .map((s) => `| ${s.id} | ${s.screen.filePath} | ${s.screen.route} |`)
    .join('\n')

  const viewTreeSummaries = screens
    .filter((s) => s.viewTree)
    .map((s) => `### ${s.id}\n\`\`\`json\n${JSON.stringify(s.viewTree!.tree, null, 2)}\n\`\`\``)
    .join('\n\n')

  return `You are analyzing a React application to generate preview controller metadata.

The project root is: ${cwd}

## Screens to Analyze

| ID | File Path | Route |
|----|-----------|-------|
${screenManifest}

## Pre-computed Component Trees

${viewTreeSummaries || 'No ViewTree data available — read the source files directly.'}

## Task

For EACH screen above:
1. Read the screen's source file to understand its UI, user interactions, state, and navigation
2. Identify all interactive elements (buttons, links, forms, toggles)
3. Identify navigation patterns (useNavigate, router.push, Link components)
4. Identify stateful components (loading states, toggles, expandable sections)
5. Generate the controller metadata

## Output Format

Return a single JSON object keyed by screen ID. Each value must match this exact schema:

\`\`\`json
{
  "<screenId>": {
    "flows": [
      {
        "trigger": { "selector": "button", "text": "Button Text" },
        "navigate": "/target-route",
        "setRegionState": { "region": "regionKey", "state": "stateName" }
      }
    ],
    "componentStates": {
      "<componentKey>": {
        "component": "ComponentName",
        "states": ["idle", "loading", "success"],
        "defaultState": "idle",
        "transitions": [
          { "from": "idle", "to": "loading", "on": "click" }
        ]
      }
    },
    "journeys": [
      {
        "name": "Journey name",
        "steps": [
          { "action": "Click X", "expectedState": "description of state after action" }
        ]
      }
    ]
  }
}
\`\`\`

## Rules

- **flows**: One entry per interactive element. Use \`{ selector: "button", text: "..." }\` for triggers — NO data attributes.
  - Include \`navigate\` if the action navigates to another route
  - Include \`setRegionState\` if the action changes a region's visual state
- **componentStates**: One entry per component that has distinct visual states (e.g., a form with idle/submitting/success/error)
  - \`states\` array lists all possible states
  - \`transitions\` describe what triggers state changes
- **journeys**: End-to-end user workflows (e.g., "Book an appointment", "Login and view dashboard")
  - Each step has an \`action\` (what the user does) and \`expectedState\` (what they see after)
- Return ONLY the JSON object, no markdown fences, no explanation
- If a screen has no interactive elements, return empty arrays/objects for that screen`
}
