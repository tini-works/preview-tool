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
- **role**: classify the hook by what it DOES (read the source code to determine this):
  - "data_fetcher" — returns async data (useQuery, useSWR, fetch+useEffect, any data loading hook)
  - "mutation" — triggers writes (useMutation, useSubmit, any hook that POSTs/PUTs/DELETEs)
  - "realtime" — subscribes to live updates (useSocket, useSubscription, WebSocket hooks)
  - "state_store" — reads/writes shared state (useStore, useAtom, useSelector, Zustand/Redux/Jotai)
  - "side_effect" — does something outside React (useNavigate, useAnalytics, useClipboard)
  - "ui_utility" — pure UI logic (useDebounce, useLongPress, useMediaQuery, useLocalStorage)
  - "context" — consumes React Context (useAuth, useTheme, useToast via useContext)
- **defaultState**: which region state to use by default
- **stateMap**: object where each key is a state name, and the value is the complete return object

IMPORTANT for stateMap values based on role:
- data_fetcher: include { data: <realistic data>, isLoading: false, error: null } shape. Also include a "loading" state with { data: null/undefined, isLoading: true, error: null } and "error" state.
- mutation: include { mutate: "__fn__", mutateAsync: "__fn__", isPending: false, isSuccess: false, error: null } shape
- realtime: same as data_fetcher but with connection status fields if applicable
- state_store: include all state fields with realistic initial values, setters as "__fn__"
- side_effect: all function returns as "__fn__"
- ui_utility: return the sensible default value (true for boolean hooks, etc.)
- context: include all context value fields with realistic defaults

Return ONLY valid JSON in this exact format:
{
  "regions": [...],
  "flows": [...],
  "mockModules": [...]
}

No markdown fences, no explanation. ONLY the JSON object.`
}
