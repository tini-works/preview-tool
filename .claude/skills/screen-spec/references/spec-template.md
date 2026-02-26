# Screen Spec Template

> Copy this template to spec a new screen. Fill in the required sections; add optional sections for complex screens.
>
> **Usage:** Save as `docs/plans/screens/{route-name}.md`, then tell Claude: "Build the screen from `docs/plans/screens/{route-name}.md`"

---

## Flow Overview *(required for multi-screen flows, omit for standalone screens)*

Show the full flow as an ASCII diagram with branching logic:

```
[1. Screen A] → [2. Screen B] → [3. Screen C] → [4. Screen D]
                                   ↑ adapts based on selection:
                                   option A → variant details
                                   option B → variant details
```

---

## `/route/path` — Screen Name

**File:** `path/to/page-file.tsx`
**Companion files:** `scenarios.ts`, `flow.ts`
**Layout pattern:** LP-N (pattern name) — see `path/to/similar-page.tsx`
**State model:** flat scenarios (`TypeName`) | regions (`regionName` region, `TypeName`)

---

### Navigation Context

- **Flow:** Flow Name (step N of M) | standalone
- **Previous:** /previous/route (trigger condition)
- **Next:** /next/route (trigger condition) | none (terminal)
- **Back target:** /back/route
- **Cancel/Abandon target:** /abandon/route (if applicable, omit otherwise)
- **Stepper:** Show steps 1-M, highlight step N | none
- **Guard:** preconditions — auth, role, store state
- **On success:** primary action result — API call, store update, navigation, toast

---

### Flow Actions

Map every interactive element to its play-mode behavior. Each row becomes a `data-flow-target` attribute on the component and an entry in `flow.ts`.

**Trigger naming:** `ComponentType:VisibleLabel` — e.g., `Button:Continue`, `RadioCard:Home Delivery`, `ScreenHeader:Page Title`

| Trigger | Action | Condition | Target | Target State | Notes |
|---------|--------|-----------|--------|--------------|-------|
| Button:CTA | navigate | — | /next/route | scenario-key | (default) |
| RadioCard:Option A | setState | — | — | option-a | |
| ScreenHeader:Title | navigate | — | /prev/route | scenario-key | Back nav |

**Column reference:**
- **Trigger** — `ComponentType:Label` matching the `data-flow-target` attribute on the element
- **Action** — `navigate` (go to another screen) or `setState` (change scenario on current screen)
- **Condition** — What must be true for this row to apply. `—` when unconditional. References a RadioCard selection, a prior state, or similar
- **Target** — Route path for `navigate`, `—` for `setState`
- **Target State** — Scenario key at the target screen (for `navigate`) or on current screen (for `setState`). Must match a key in the target's States section
- **Notes** — Mark `(default)` for the action wired in `flow.ts`. Add `Back nav` for header back arrows

**Rules:**
- Every `Button` and `RadioCard` from the Elements table needs at least one row
- Every `ScreenHeader` with back navigation needs a row
- When one trigger has multiple conditional rows, exactly one must be marked `(default)`
- For multi-screen flows, the `(default)` rows must form a complete forward path
- Multi-step sequences (e.g., tap → animate → navigate): document all steps, mark the play-mode shortcut as `(default)`

---

### Elements

Use variant sub-tables when a screen has conditional sections (e.g., different content for pickup vs delivery). Use a single table when all elements are always visible.

#### Single table (all elements always visible)

| # | Element | Type | Data / Content |
|---|---------|------|----------------|
| 1 | Page title | Text | "Screen Name" |
| 2 | CTA button | Button | -> /next/route |
| 3 | Item list | List | field1, field2, field3, status |

#### Variant tables (conditional sections)

**Elements — [Section Name] (always visible)**

| # | Element | Type | Data / Content |
|---|---------|------|----------------|
| 1 | Screen header | ScreenHeader | title: "Screen Name" |
| 2 | Instruction text | Text | "Choose an option" |
| 3 | Option A card | RadioCard | Title: "Option A", description |
| 4 | Option B card | RadioCard | Title: "Option B", description |

**Elements — Variant A: [Name] (shown when [condition])**

| # | Element | Type | Data / Content |
|---|---------|------|----------------|
| 5a | Detail section | Card | Variant A specific content |
| 6a | Form field | Input | Variant A specific input |

**Elements — Variant B: [Name] (shown when [condition])**

| # | Element | Type | Data / Content |
|---|---------|------|----------------|
| 5b | Detail section | Card | Variant B specific content |
| 6b | Different element | Visual | Variant B specific visual |

**Elements — [Shared Section] (always visible)**

| # | Element | Type | Data / Content |
|---|---------|------|----------------|
| 7 | Continue button | Footer + Button | "Continue" — disabled when [condition] |

#### Element Detail sub-sections

For complex composite elements (cards with multiple fields, list items with rich content), break out the detail:

**Elements Detail — [Complex Element Name]**

Each [element] shows:
- **Field 1** — description (e.g., "Medication name — primary text")
- **Field 2** — description (e.g., "Dosage — secondary text")
- **Field 3** — description (e.g., "Status badge — READY (emerald), PENDING (amber)")
- Interaction notes (e.g., "Only READY items are selectable; PENDING items are visually muted with checkbox disabled")

> **Common element types:**
> Text, Input, Button, Link, Image, Badge, Card, List, List Item, Tab, Dropdown,
> Navigation, Switch, Checkbox, Read-only, Date Input, Date Range, Textarea, Tags,
> Timer, Selector, Toggle, Visual, Widget, Grid, Calendar, Table, Banner, Alert,
> Preview, Status Indicator, Upload, Static, Email

---

### States

Declare the state model, then describe each state with concrete details about what's visible and what changes.

**Flat scenarios** (simple screens with a single state dimension):

Scenarios: `idle`, `scanning`, `success`, `error`

- [x] **idle** — Default state: illustration + instruction + scan button
- [x] **scanning** — Pulsing animation, instruction changes to "Reading...", button disabled
- [x] **success** — Checkmark animation, "Verified!" text, auto-navigates after 1.5s
- [x] **error** — Error note shown, "Try Again" button replaces scan button

**Type:** `ScreenNameData = { state: 'idle' | 'scanning' | 'success' | 'error' }`

**Regions** (screens with independent state dimensions):

Region: `regionName` — states: `state-a`, `state-b`, `state-c`

- [x] **state-a** — Description of what's visible, which elements shown/hidden
- [x] **state-b** — Description
- [x] **state-c** — Description

**Type:**
```typescript
type ScreenNameData = {
  field: 'value-a' | 'value-b'
  otherField?: string
  nestedData?: NestedType[]
}
```

**Conditional elements:**
- {element} shown when {condition}
- {element} hidden when {condition}
- {element} disabled when {condition}

---

### Data

**Reads:**
- API: `GET /api/{endpoint}` | Collection/query: `{collectionName}`
- Store: `use{StoreName}` — fields: x, y, z
- URL params: `useParams` | Query params: `useSearchParams`
- Auth: current user role, id

**Writes:**
- API: `POST/PATCH/DELETE /api/{endpoint}` — payload: { ... }
- Store: `use{StoreName}.setX(value)`
- Toast: success/error notification message

---

### Layout Sketch

**Required.** Generate one sketch per significant visual variant (e.g., pickup vs delivery, review vs success). Label interactive elements with their trigger name as comments.

Rules:
- 42-char wide outer frame
- Label each section on the right side with a comment
- Show conditional elements with a note (e.g., "conditional alert")
- Show all states inline where possible (e.g., "[Badge]" for status)
- Use realistic placeholder data relevant to the app's domain, not "Lorem ipsum"
- Annotate interactive elements with their trigger name: `│ [Continue]  │  Button:Continue`
- Generate separate sketches for terminal states (success, error) when they replace screen content

**Primary variant:**
```
┌──────────────────────────────────────────┐
│ ← Back link                              │  ScreenHeader:Page Title
├──────────────────────────────────────────┤
│ "Page Title"                   [Badge]   │  header
│ Subtitle text                            │
├──────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐ │
│ │ Content area                         │ │  card
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ [Action 1]  [Action 2]                   │  Button:Action 1
└──────────────────────────────────────────┘
```

**Success state** *(when success replaces screen content):*
```
┌──────────────────────────────────────────┐
│           ┌────────┐                     │
│           │   ✓    │                     │  success icon
│           └────────┘                     │
│    "Success message"                     │
│    Detail text                           │
│    [    Back to Home    ]                │  Button:Back to Home
└──────────────────────────────────────────┘
```

---

### i18n Keys

Provide translations for all supported locales. Both files are co-located in the screen folder. Keys are **flat** (no nesting), matching the co-located locale convention.

**`en.json`:**
```json
{
  "title": "Screen Title",
  "description": "Instruction or description text",
  "emptyState": "No items yet",
  "cta": "Continue"
}
```

**`de.json`:**
```json
{
  "title": "Bildschirmtitel",
  "description": "Anweisungs- oder Beschreibungstext",
  "emptyState": "Noch keine Einträge",
  "cta": "Weiter"
}
```

---

### Constraints *(optional — for screens with special rules)*

- **Performance:** load time, API timeout
- **Validation:** schema rules, field constraints
- **Privacy/GDPR:** consent requirements, data handling
- **Rate limits:** max requests, cooldown periods
- **Accessibility:** specific a11y requirements beyond defaults

---

### Edge Cases & Known Limitations *(optional)*

Document workarounds, framework constraints, or incomplete behavior:

- **Issue title** — Affected screens, what doesn't work as expected, root cause analysis, workaround if any

---

### Definition of Done

> A screen is done when all verification commands pass without error.

**Automated verification** — run in order:

1. **Files exist:**
   ```bash
   ls {screen_path}/index.tsx {screen_path}/scenarios.ts {screen_path}/en.json {screen_path}/de.json {screen_path}/flow.ts
   ```

2. **TypeScript compiles:**
   ```bash
   pnpm exec tsc --noEmit
   ```

3. **Build succeeds:**
   ```bash
   pnpm build
   ```

4. **All i18n keys used in index.tsx exist in en.json and de.json:**
   ```bash
   grep -oE "t\('[^']+'" | sed "s/t('//;s/'//" {screen_path}/index.tsx | sort -u | while read key; do
     jq -e ".[\"$key\"]" {screen_path}/en.json > /dev/null || echo "MISSING en: $key"
     jq -e ".[\"$key\"]" {screen_path}/de.json > /dev/null || echo "MISSING de: $key"
   done
   ```

5. **All flow triggers have matching data-flow-target in index.tsx:**
   ```bash
   grep -oE "trigger: '[^']+'" | sed "s/trigger: '//;s/'//" {screen_path}/flow.ts | while read trigger; do
     grep -q "data-flow-target=\"$trigger\"" {screen_path}/index.tsx || echo "MISSING target: $trigger"
   done
   ```

6. **No forbidden Tailwind color classes:**
   ```bash
   grep -nE '(neutral|gray|zinc|red|green|blue|orange)-[0-9]' {screen_path}/index.tsx && echo "FAIL: forbidden colors" || echo "OK"
   ```

7. **All scenarios from spec are in scenarios.ts:**
   ```bash
   for key in {scenario_keys}; do
     grep -q "'$key'" {screen_path}/scenarios.ts || echo "MISSING scenario: $key"
   done
   ```

The skill populates `{screen_path}` and `{scenario_keys}` from the spec content. All commands must produce zero error output.

**Or run the reusable script:**
```bash
bash ~/.claude/skills/screen-spec/references/verify-screen.sh {section}/{screen}
```

---

## Flow-Level Sections *(required for multi-screen flows, omit for standalone screens)*

### i18n Namespace Mapping

| Screen | Namespace | Files |
|--------|-----------|-------|
| screen-name | `section-screen` | `src/screens/section/screen/{en,de}.json` |

### Mock Data Summary

| Screen | Type | Source |
|--------|------|--------|
| screen-name | `TypeName` | `src/screens/section/screen/scenarios.ts` |

### Migration Notes *(optional — when replacing or modifying existing screens)*

- **Delete** `path/to/removed/screen/` — reason
- **Merge** content from X into Y — what moves
- **Update** references in Z — what changes
