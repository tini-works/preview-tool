import type { ViewTree } from '../../analyzer/types.js'

/** Maximum source code characters to include in the LLM prompt */
const MAX_SOURCE_CHARS = 10_000

export function buildGenerateMCPrompt(viewTree: ViewTree, sourceCode: string): string {
  const truncatedSource = sourceCode.length > MAX_SOURCE_CHARS
    ? sourceCode.slice(0, MAX_SOURCE_CHARS) + '\n// ... truncated for length'
    : sourceCode

  return `Analyze this React screen component and generate preview metadata.

## Screen Info
- Name: ${viewTree.screenName}
- File: ${viewTree.filePath}
- Export: ${viewTree.exportType}${viewTree.exportName ? ` (${viewTree.exportName})` : ''}

## Component Tree (from static analysis)
${JSON.stringify(viewTree.tree, null, 2)}

## Screen Props
${JSON.stringify(viewTree.dataProps, null, 2)}

## Source Code
\`\`\`tsx
${truncatedSource}
\`\`\`

## Required Output

Return a JSON object with exactly this structure:

{
  "model": {
    "regions": {
      "<regionKey>": {
        "label": "Human-readable label",
        "component": "ComponentName from the tree",
        "componentPath": "path.to.component in tree",
        "states": {
          "<stateName>": { "<propKey>": "<value>" }
        },
        "defaultState": "<stateName>",
        "isList": true,
        "mockItems": [],
        "defaultCount": 3
      }
    }
  },
  "controller": {
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
        "states": ["idle", "loading"],
        "defaultState": "idle",
        "transitions": [{ "from": "idle", "to": "loading", "on": "click" }]
      }
    },
    "journeys": [
      {
        "name": "Journey name",
        "steps": [{ "action": "Click X", "expectedState": "description" }]
      }
    ]
  }
}

Rules:
- Create one region per meaningful UI component (tables, lists, forms, stat cards, etc.)
- Skip trivial elements (individual buttons, icons, labels) unless they have distinct states
- For list regions: mockItems must have at least 10 items, defaultCount = 3
- For triggers: use { selector: "button", text: "..." } format — NO data attributes
- Return ONLY the JSON object, no markdown wrapping

CRITICAL — State data format:
- Each state MUST contain actual mock data that the component would receive, wrapped in a "data" key
- "populated" state: { "data": [realistic items array] } or { "data": { realistic object } }
- "loading" state: { "_loading": true }
- "empty" state: { "data": [] }
- "error" state: { "_error": true, "message": "descriptive error message" }
- Mock data must be realistic and domain-appropriate with proper field types

Section ID Detection (for apps with DevToolStore integration):
- Look for patterns like \`useAppLiveQuery(query, 'sectionId')\` or \`useDevToolStore(s => s.sectionStates['sectionId'])\` in the source code
- If section IDs are found, use them as region keys (e.g., 'service-grid', 'login-form', 'time-slots') instead of generic names`
}
