# Definition of Done for Screen Implementation

**Date:** 2026-02-26
**Approach:** B — DoD Checklist + Flow Actions Table in screen-spec skill
**Consumer:** AI agents (Claude) via the screen-spec skill
**Location:** Embedded in the screen-spec skill's spec template

---

## Problem

Screen specs define Navigation Context, Elements, States, Data, i18n Keys, and Mock Data — but there's no mapping from spec sections to implementation artifacts. This has caused:

- **Missing `flow.ts` files** — screens render but navigation doesn't work in play mode
- **Missing translations** — hardcoded English instead of `t()` calls, missing `de.json`
- **Incomplete scenarios** — spec states not all represented as switchable scenarios
- **Brand color violations** — Tailwind defaults used instead of brand tokens
- **No verification checklist** — Claude doesn't know when a screen is truly "done"

## Design

Two additions to the screen-spec skill's output:

### 1. Flow Actions Table (new spec section)

Goes under Navigation Context, before Elements. Maps interactive elements to their `flow.ts` actions.

#### Table Format

| Column | Description |
|--------|-------------|
| Trigger | `ComponentType:Label` matching the `data-flow-target` attribute |
| Action | `navigate` (go to another screen) or `setState` (change scenario on current screen) |
| Condition | What must be true for this row to apply. `—` when unconditional. References a RadioCard selection, a prior state, or similar. |
| Target | Route path for `navigate`, `—` for `setState` |
| Target State | Scenario key at the target screen (for `navigate`) or on current screen (for `setState`) |
| Notes | Implementation notes, marked `(default)` for the path wired in flow.ts |

#### Trigger Naming Convention

| Component | Trigger format | Example |
|---|---|---|
| Button | `Button:{visible label}` | `Button:Continue`, `Button:Try Again` |
| ScreenHeader | `ScreenHeader:{title text}` | `ScreenHeader:Delivery Method` |
| RadioCard | `RadioCard:{option label}` | `RadioCard:Home Delivery` |
| ListItem | `ListItem:{label text}` | `ListItem:Specialty & Doctor` |
| Card | `Card:{identifying text}` | `Card:APO Apotheke Marienplatz` |

#### Example

| Trigger | Action | Condition | Target | Target State | Notes |
|---------|--------|-----------|--------|--------------|-------|
| RadioCard:Home Delivery | setState | — | — | home-delivery | |
| RadioCard:Apotheke Pickup | setState | — | — | apotheke-pickup | |
| Button:Continue | navigate | RadioCard:Apotheke Pickup | /prescription/location | pickup-selected | (default) |
| Button:Continue | navigate | RadioCard:Home Delivery | /prescription/location | delivery-prefilled | |
| ScreenHeader:Delivery Method | navigate | — | /prescription/list | populated | Back nav |

#### Conditional Navigation

The current `FlowAction` type only supports one action per trigger (no runtime conditionals). When a trigger has multiple conditional rows:

1. The row marked `(default)` is what gets wired in `flow.ts`
2. All other rows are **documented behavior** — they define the expected UX but aren't playable in the current flow system
3. If the flow system later gains conditional support, the spec already has the full mapping

#### Multi-Step Transitions

Same trigger, sequential states — documented as separate rows with a sequence note:

| Trigger | Action | Condition | Target | Target State | Notes |
|---------|--------|-----------|--------|--------------|-------|
| Button:Simulate NFC Scan | setState | — | — | scanning | Step 1 of sequence |
| (auto after 1s) | setState | state: scanning | — | success | Step 2 (timed) |
| (auto after 1.5s) | navigate | state: success | /prescription/list | populated | Step 3 (timed) |
| **Button:Simulate NFC Scan** | **navigate** | — | **/prescription/list** | **populated** | **(default) play-mode shortcut** |

The bold row is what `flow.ts` actually implements. The sequence rows document the intended UX.

#### Validation Rules

- Every `Button` and `RadioCard` in the Elements table must have at least one trigger row
- Every `ScreenHeader` with back navigation must have a trigger row
- Every `Target State` must match a scenario key on the target screen
- Exactly one row per trigger must be marked `(default)` when multiple conditional rows exist
- For multi-screen flows, the default rows must form a complete path from first to last screen

### 2. Definition of Done Checklist (new spec section)

Goes at the **bottom of each generated spec**, after all other sections. The skill populates it with screen-specific items derived from the spec content.

#### Template

```markdown
## Definition of Done

### Files
- [ ] `index.tsx` — screen component renders all elements from spec
- [ ] `scenarios.ts` — scenarios: {list of scenario keys from States section}
- [ ] `en.json` — English translations for all i18n keys from spec
- [ ] `de.json` — German translations for all i18n keys from spec
- [ ] `flow.ts` — all (default) actions from Flow Actions table

### UI Compliance
- [ ] All strings use `t()` — no hardcoded text in JSX
- [ ] Brand color tokens only — no Tailwind default palettes (`neutral-*`, `gray-*`, `zinc-*`, etc.)
- [ ] All interactive elements have `data-flow-target` attributes matching Flow Actions triggers
- [ ] Every `<Input>` has an associated `<Label>` with matching `htmlFor`/`id`

### States & Scenarios
- [ ] Every state from spec has a matching scenario in `scenarios.ts`
- [ ] Loading states show skeleton or spinner
- [ ] Empty states show message with optional CTA
- [ ] Error states show message with retry action
- [ ] Async buttons show disabled + loading feedback

### Accessibility
- [ ] Images have `alt` attributes (decorative: `alt="" aria-hidden="true"`)
- [ ] Color-coded visuals include a text label — never color-only
- [ ] Status badges use consistent variant mapping (ready=success, pending=warning, expired=error)

### Flow & Navigation
- [ ] All (default) Flow Actions wired in `flow.ts`
- [ ] ScreenHeader back navigation triggers defined
- [ ] Stepper shows correct step position
- [ ] Play mode walkthrough: can navigate the full happy path by clicking
```

#### Customization Rules

When generating the DoD, the skill:

1. **Files section** — Lists the exact scenario keys from States (e.g., `idle, scanning, success, error`)
2. **States & Scenarios** — Only includes items that apply (no list → skip loading/empty/populated; no async → skip async buttons)
3. **Flow & Navigation** — Only included if the screen is part of a multi-screen flow. Standalone screens skip Stepper and happy-path items.
4. **Accessibility** — Only includes image/badge items if the screen has images or badges
5. **Locales** — Both `en.json` and `de.json` are always required

The checklist must be **specific, not generic** — every item should be verifiable against the spec content.

## Implementation Scope

### Changes needed:

1. **screen-spec skill** — Update the spec template to include:
   - Flow Actions section (after Navigation Context, before Elements)
   - Definition of Done section (at the bottom of the spec)
   - Skill instructions for generating both sections

2. **Existing specs** — Optionally backfill `prescription-redeem.md` and `profile.md` with the new sections

### Out of scope:

- Automated enforcement (linting, CI checks)
- Changes to the `FlowAction` type to support conditions
- Changes to CLAUDE.md (the DoD lives in the skill, not in project instructions)
