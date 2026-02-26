# Definition of Done — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update the screen-spec skill to produce Flow Actions tables and Definition of Done checklists in every generated screen spec.

**Architecture:** Two files in the screen-spec skill need changes: `references/spec-template.md` (the template Claude follows when generating a spec) and `SKILL.md` (the skill instructions that tell Claude how to fill in the template). Both are prompt-engineering artifacts, not runtime code.

**Tech Stack:** Markdown files in `~/.claude/skills/screen-spec/`

---

### Task 1: Add Flow Actions section to spec template

**Files:**
- Modify: `~/.claude/skills/screen-spec/references/spec-template.md:17-27` (after Navigation Context, before Elements)

**Step 1: Add Flow Actions section between Navigation Context and Elements**

Insert the following new section after the Navigation Context `---` divider (line 27) and before the `### Elements` section (line 30):

```markdown
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
```

**Step 2: Verify the edit**

Read back `references/spec-template.md` and confirm:
- Flow Actions section appears between Navigation Context and Elements
- The table headers are: Trigger | Action | Condition | Target | Target State | Notes
- The rules list has 5 bullet points

---

### Task 2: Update i18n Keys section to require both en + de

**Files:**
- Modify: `~/.claude/skills/screen-spec/references/spec-template.md:120-133` (i18n Keys section)

**Step 1: Replace the i18n Keys section**

Replace the existing i18n Keys section with:

```markdown
### i18n Keys *(required if project uses i18n)*

Provide translations for all supported locales. Both files are co-located in the screen folder.

**en.json:**
```json
{
  "screenName": {
    "title": "Screen Title",
    "emptyState": "No items yet",
    "emptyHint": "Create one to get started.",
    "cta": "Create Item"
  }
}
```

**de.json:**
```json
{
  "screenName": {
    "title": "Bildschirmtitel",
    "emptyState": "Noch keine Einträge",
    "emptyHint": "Erstellen Sie einen, um zu beginnen.",
    "cta": "Element erstellen"
  }
}
```
```

**Step 2: Verify the edit**

Read back the file and confirm both `en.json` and `de.json` blocks are present.

---

### Task 3: Add Definition of Done section to spec template

**Files:**
- Modify: `~/.claude/skills/screen-spec/references/spec-template.md` (append at end of file)

**Step 1: Append the DoD section at the end of the template**

Add after the i18n Keys section:

```markdown
---

### Definition of Done

> Populated by the skill with screen-specific items. Claude checks these off during implementation.

#### Files
- [ ] `index.tsx` — screen component renders all elements from spec
- [ ] `scenarios.ts` — scenarios: {list scenario keys from States, e.g., `idle, scanning, success, error`}
- [ ] `en.json` — English translations for all i18n keys above
- [ ] `de.json` — German translations for all i18n keys above
- [ ] `flow.ts` — all (default) actions from Flow Actions table

#### UI Compliance
- [ ] All strings use `t()` — no hardcoded text in JSX
- [ ] Brand color tokens only — no Tailwind default palettes
- [ ] All interactive elements have `data-flow-target` attributes matching Flow Actions triggers
- [ ] Every `<Input>` has an associated `<Label>` with matching `htmlFor`/`id`

#### States & Scenarios
- [ ] Every state from spec has a matching scenario in `scenarios.ts`
- [ ] Loading states show skeleton or spinner
- [ ] Empty states show message with optional CTA
- [ ] Error states show message with retry action
- [ ] Async buttons show disabled + loading feedback

#### Accessibility
- [ ] Images have `alt` attributes (decorative: `alt="" aria-hidden="true"`)
- [ ] Color-coded visuals include a text label — never color-only
- [ ] Status badges use consistent variant mapping

#### Flow & Navigation
- [ ] All (default) Flow Actions wired in `flow.ts`
- [ ] ScreenHeader back navigation triggers defined
- [ ] Stepper shows correct step position (if multi-step flow)
- [ ] Play mode walkthrough: full happy path navigable by clicking

**Customization rules for the skill:**
1. **Files** — list exact scenario keys from States section
2. **States & Scenarios** — only include items that apply to this screen (skip loading/empty if no lists; skip async if no async buttons)
3. **Flow & Navigation** — omit Stepper and happy-path items for standalone screens
4. **Accessibility** — only include image/badge items if screen has them
```

**Step 2: Verify the edit**

Read back the end of the file and confirm the DoD section has all 5 subsections: Files, UI Compliance, States & Scenarios, Accessibility, Flow & Navigation.

---

### Task 4: Update SKILL.md Phase 3 to reference new sections

**Files:**
- Modify: `~/.claude/skills/screen-spec/SKILL.md:131-213` (Phase 3: Draft the Spec)

**Step 1: Add Flow Actions to the Required Sections list**

In Phase 3's "Required Sections" (around line 145), after section **2. Navigation Context** and before section **3. Elements**, insert:

```markdown
**3. Flow Actions** — Required for screens in a multi-step flow. Optional for standalone screens. Map every interactive element (buttons, radio cards, screen header back arrow) to its `data-flow-target` trigger and `flow.ts` action. See `references/spec-template.md` for the table format and validation rules.
```

Renumber the subsequent sections: Elements becomes **4**, States becomes **5**, Data becomes **6**.

**Step 2: Move i18n Keys from Optional to Required**

In the "Optional Sections" block (around line 210), remove the `i18n Keys` bullet. Add it as a required section:

```markdown
**7. i18n Keys** — Required if the project uses i18n. Provide both `en.json` and `de.json` content. Keys should use the screen's namespace and cover all user-visible strings.
```

**Step 3: Add Definition of Done to Required Sections**

After the new section 7, add:

```markdown
**8. Definition of Done** — Always required. Populated with screen-specific items from the spec content. See `references/spec-template.md` for the template and customization rules. The skill must tailor the checklist: list exact scenario keys, omit inapplicable items, and include flow items only for multi-step flows.
```

**Step 4: Verify the edit**

Read back SKILL.md Phase 3 and confirm:
- Required Sections lists 8 items: Header, Navigation Context, Flow Actions, Elements, States, Data, i18n Keys, Definition of Done
- Optional Sections only has Constraints remaining
- Flow Actions references spec-template.md for format details

---

### Task 5: Update SKILL.md Phase 3 ASCII layout guidance

**Files:**
- Modify: `~/.claude/skills/screen-spec/SKILL.md` (ASCII Layout Preview section)

**Step 1: Add `data-flow-target` notation to ASCII layout rules**

In the ASCII Layout Preview rules list, add one more bullet:

```markdown
- Annotate interactive elements with their trigger name in comments: `│ [Continue]  │  Button:Continue`
```

**Step 2: Update the ASCII example**

Replace the existing example with one that shows trigger annotations:

```markdown
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
```

**Step 3: Verify the edit**

Read back the ASCII section and confirm trigger annotations appear in the example.

---

### Task 6: Verify complete skill by reading both files end-to-end

**Step 1: Read the full spec template**

Read `~/.claude/skills/screen-spec/references/spec-template.md` end-to-end. Verify section order:
1. Header
2. Navigation Context
3. **Flow Actions** (new)
4. Elements
5. States
6. Data
7. Layout Sketch
8. Constraints (optional)
9. **i18n Keys** (now required, both en + de)
10. **Definition of Done** (new)

**Step 2: Read the full SKILL.md**

Read `~/.claude/skills/screen-spec/SKILL.md` end-to-end. Verify:
- Phase 3 Required Sections lists 8 items
- Optional Sections only has Constraints
- Flow Actions references are consistent with spec-template.md
- No broken references or orphaned content

**Step 3: Cross-reference with design doc**

Compare against `docs/plans/2026-02-26-definition-of-done-design.md` and confirm all design requirements are implemented:
- Flow Actions table format matches (6 columns: Trigger, Action, Condition, Target, Target State, Notes)
- Trigger naming convention documented
- Conditional navigation and multi-step transition patterns documented
- Validation rules present (5 rules)
- DoD checklist has all 5 categories (Files, UI Compliance, States & Scenarios, Accessibility, Flow & Navigation)
- Both en.json and de.json required
- Customization rules present (4 rules)
