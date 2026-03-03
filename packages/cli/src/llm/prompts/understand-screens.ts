import type { ScreenFacts } from '../../analyzer/types.js'

/**
 * Build a single batch prompt that sends all screen facts to Claude Code
 * and asks for semantic understanding: regions, state machines, flows.
 */
export function buildUnderstandScreensPrompt(screenFacts: ScreenFacts[]): string {
  const screenSections = screenFacts.map((facts) => {
    const hooksSection = facts.hooks.length > 0
      ? `Hooks called:\n${facts.hooks.map((h) => `  - ${h.name}(${h.arguments.join(', ')}) from "${h.importPath}"${h.returnVariable ? ` → ${h.returnVariable}` : ''}`).join('\n')}`
      : 'No hooks detected.'

    const componentsSection = facts.components.length > 0
      ? `Components used:\n${facts.components.map((c) => `  - <${c.name} ${c.props.join(' ')} /> from "${c.importPath}"${c.children.length > 0 ? ` children: [${c.children.join(', ')}]` : ''}`).join('\n')}`
      : 'No imported components.'

    const conditionalsSection = facts.conditionals.length > 0
      ? `Conditional rendering:\n${facts.conditionals.map((c) => `  - if (${c.condition}) → [${c.trueBranch.join(', ')}]${c.falseBranch.length > 0 ? ` else → [${c.falseBranch.join(', ')}]` : ''}`).join('\n')}`
      : 'No conditional rendering.'

    const navSection = facts.navigation.length > 0
      ? `Navigation:\n${facts.navigation.map((n) => `  - ${n.trigger} → ${n.target}`).join('\n')}`
      : 'No navigation detected.'

    return `
### Screen: ${facts.route}
File: ${facts.filePath}

${hooksSection}

${componentsSection}

${conditionalsSection}

${navSection}

Source code:
\`\`\`tsx
${facts.sourceCode}
\`\`\`
`
  }).join('\n---\n')

  return `You are analyzing React screens for a preview tool. For each screen below, identify:

1. **Regions**: Distinct UI sections that display data from different sources. Each region has:
   - A unique key (kebab-case, e.g., "service-list", "user-profile")
   - A human-readable label
   - A type: list, detail, form, status, auth, media, or custom
   - hookBindings: which hooks feed this region (format: "hookName:identifier")
   - states: the different states this region can be in, with mock data for each
   - For list regions: include isList=true, mockItems (10+ items), defaultCount=3

2. **Flows**: User interactions that navigate to other screens or change region state.
   - trigger: CSS selector + optional text match for the interactive element
   - action: "navigate" (go to another screen), "setState" (change region), or "setRegionState"
   - target: the route (for navigate) or state name (for setState)

Rules:
- Every data-fetching hook MUST be bound to a region
- Every region MUST have at least: a "populated" state and a "loading" state
- List regions should also have an "empty" state
- Forms should have: idle, submitting, success, error states
- Auth regions should have: authenticated, unauthenticated states
- Generate realistic mock data (not generic "Item 1", "Item 2")
- Detect ALL clickable elements that navigate or change state

Return a JSON array where each element matches this schema:
{
  "route": string,
  "regions": [{ key, label, type, hookBindings, states: { [stateName]: { label, mockData } }, defaultState, isList?, mockItems?, defaultCount? }],
  "flows": [{ trigger: { selector, text?, ariaLabel? }, action, target, targetRegion? }]
}

Return ONLY valid JSON. No markdown, no explanation.

---

${screenSections}`
}
