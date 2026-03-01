import type { ViewTree } from '../../analyzer/types.js'

export function buildGenerateMCPrompt(viewTree: ViewTree, sourceCode: string): string {
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
${sourceCode}
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
- Mock data must be realistic and domain-appropriate
- Return ONLY the JSON object, no markdown wrapping`
}
