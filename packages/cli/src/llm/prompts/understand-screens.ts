import type { ScreenFacts } from '../../analyzer/types.js'

/**
 * Build a single batch prompt that sends all screen facts to Claude Code
 * and asks for semantic understanding: regions, state machines, flows.
 */
export function buildUnderstandScreensPrompt(screenFacts: ScreenFacts[]): string {
  const screenSections = screenFacts.map((facts) => {
    const hooksSection = facts.hooks.length > 0
      ? `Hooks called:\n${facts.hooks.map((h) => {
          let line = `  - ${h.name}(${h.arguments.join(', ')}) from "${h.importPath}"`
          if (h.returnVariable) line += ` → ${h.returnVariable}`
          if (h.destructuredFields && h.destructuredFields.length > 0) {
            line += ` [fields: ${h.destructuredFields.join(', ')}]`
          }
          return line
        }).join('\n')}`
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
- States MUST be derived from the screen's ACTUAL conditional rendering and UI branches.
  Look at the "Conditional rendering" section: each condition (e.g., isLoading, error, data.length === 0)
  represents a distinct visual state the screen can be in. Create a state for EACH visual scenario.
- For store hooks (useXxxStore):
  - The mockData MUST include ALL destructured data fields as keys (check the [fields: ...] annotation).
  - Fields that are functions (e.g., login, logout, clearError) should be OMITTED from mockData — they are auto-stubbed.
  - Fields that are data (e.g., user, isLoading, error, token, isAuthenticated) MUST be included with realistic values in EVERY state.
  - Example: if a screen destructures { login, isLoading, error, clearError } from useAuthStore,
    the mockData for each state MUST include isLoading and error (login and clearError are auto-stubbed).
- Minimum states per region type:
  - list: populated, loading, empty
  - form: default (idle form), submitting (isLoading=true), error (error message shown)
  - auth: use the screen's actual conditionals — e.g., if it checks isLoading and error, include
    default (idle), loading, error states. Only use "authenticated/unauthenticated" if the screen
    conditionally renders different layouts based on isAuthenticated.
  - detail: populated, loading
  - status/custom: derive from conditionals
- defaultState should be the most common visual state (usually idle/default, NOT loading)
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
