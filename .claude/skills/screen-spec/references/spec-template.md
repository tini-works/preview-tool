# Screen Spec Template

> Copy this template to spec a new screen. Fill in the required sections; add optional sections for complex screens.
>
> **Usage:** Save as `docs/plans/screens/{route-name}.md`, then tell Claude: "Build the screen from `docs/plans/screens/{route-name}.md`"

---

## `/route/path` — Screen Name

**Source:** [requirement reference, user story, or ticket]
**File:** `path/to/page-file.tsx`
**Layout pattern:** LP-N (pattern name) — see `path/to/similar-page.tsx`

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

### Elements

**Brief mode** — use bullet points for simple screens:

- Page title: "Screen Name"
- Description text explaining the purpose
- Primary CTA button -> /next/route
- List of items showing: field1, field2, field3, status badge
- Filter dropdown for field1

**Detailed mode** — use the element table for complex screens:

| # | Element | Type | Data / Content |
|---|---------|------|----------------|
| 1 | Page title | Text | "Screen Name" |
| 2 | CTA button | Button | -> /next/route |
| 3 | Item list | List | field1, field2, field3, status |
| 4 | Filter | Dropdown | Filter by field1 |

> **Common element types:**
> Text, Input, Button, Link, Image, Badge, Card, List, List Item, Tab, Dropdown,
> Navigation, Switch, Checkbox, Read-only, Date Input, Date Range, Textarea, Tags,
> Timer, Selector, Toggle, Visual, Widget, Grid, Calendar, Table, Banner, Alert,
> Preview, Status Indicator, Upload, Static, Email

---

### States

List the states this screen needs. Check all that apply:

- [ ] **Loading** — spinner/skeleton while data loads
- [ ] **Empty** — icon + message when no data (describe the message)
- [ ] **Populated** — primary state with data
- [ ] **Error** — error icon + message + retry action
- [ ] **Not found** — when a specific item doesn't exist
- [ ] **Offline** — banner or overlay when offline

**Conditional elements** (show/hide logic):

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

### Layout Sketch *(optional — for complex screens)*

```
┌─────────────────────────────────────────┐
│ "Title"                      [CTA Btn]  │
├─────────────────────────────────────────┤
│ [Tab 1 | Tab 2]                         │
├─────────────────────────────────────────┤
│ [Filter v] [Filter v]                   │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ Item row — primary text     [Badge] │ │
│ │ secondary text                      │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

---

### Constraints *(optional — for screens with special rules)*

- **Performance:** load time, API timeout
- **Validation:** schema rules, field constraints
- **Privacy/GDPR:** consent requirements, data handling
- **Rate limits:** max requests, cooldown periods
- **Accessibility:** specific a11y requirements beyond defaults

---

### i18n Keys *(optional — only if new keys needed)*

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

> Omit this section if reusing existing keys or if the project doesn't use i18n.
