export function buildAnalyzeScreenPrompt(
  screenSource: string,
  hookSources: Record<string, string>,
  typeInfo: Record<string, unknown>,
): string {
  const hookSection = Object.entries(hookSources)
    .map(([path, source]) => `### ${path}\n\`\`\`typescript\n${source}\n\`\`\``)
    .join('\n\n')

  const typeSection = Object.keys(typeInfo).length > 0
    ? `## Type Information (from TypeChecker)\n\`\`\`json\n${JSON.stringify(typeInfo, null, 2)}\n\`\`\``
    : ''

  return `You are analyzing a React screen for a preview tool that renders screens in isolation with mock data.

## Screen Source Code
\`\`\`typescript
${screenSource}
\`\`\`

## Imported Hook Sources
${hookSection || '(no imported hooks found)'}

${typeSection}

## Instructions

Analyze this screen and return a JSON object with three sections:

### 1. Regions
Distinct data-driven UI sections. Each region has:
- **key** (kebab-case): unique identifier matching the data source
- **label**: human-readable name
- **type**: one of: list, detail, form, status, auth, media, custom
- **source**: which data source feeds this region:
  - type: "hook" | "useState" | "useSearchParams" | "prop"
  - name: the hook/variable name
  - importPath: the import path (for hooks only)
- **states**: object where each key is a state name with:
  - label: human description
  - mockData: complete mock object matching the hook's return shape

Rules for states:
- Every conditional branch in the JSX MUST map to at least one state
- States MUST cover: default, loading, error, and empty cases where applicable
- mockData MUST include ALL destructured fields from the hook
- Functions in mockData should use the string "__fn__" as placeholder
- Generate realistic, domain-specific mock data

### 2. Flows
User interactions that change state:
- **trigger**: what the user does
- **action**: "navigate" | "setState" | "setRegionState"
- **from**: current state (optional)
- **to**: target state or route

### 3. Mock Modules
For each imported hook that needs mocking:
- **hookName**: the hook function name
- **importPath**: the import path
- **defaultState**: which region state to use by default
- **stateMap**: object where each key is a state name, and the value is the complete return object

Return ONLY valid JSON in this exact format:
{
  "regions": [...],
  "flows": [...],
  "mockModules": [...]
}

No markdown fences, no explanation. ONLY the JSON object.`
}
