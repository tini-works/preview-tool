# Layout Patterns Catalog

Universal layout patterns for web applications. When generating a spec, identify which pattern the new screen matches and reference it along with a similar existing page from the project's codebase.

## Pattern Index

| ID | Pattern | Common Use Cases |
|----|---------|-----------------|
| LP-1 | Centered single-card form | Login, register, forgot password, verify email, reset password |
| LP-2 | Stepper-guided multi-step | Checkout, onboarding, booking flow, wizard forms |
| LP-3 | Tabbed list with filters | Orders, appointments, tickets, messages, notifications |
| LP-4 | Detail page with read-only rows | Order detail, appointment detail, invoice, ticket view |
| LP-5 | Dashboard with widget sections | Home dashboard, admin overview, analytics |
| LP-6 | Sectioned form page | Profile settings, account settings, preferences |
| LP-7 | List with inline CRUD | Addresses, dependents, team members, saved cards |
| LP-8 | Data table with filters | Admin lists, reports, audit logs, user management |
| LP-9 | Selection grid | Category picker, plan selector, service chooser |
| LP-10 | Searchable list with favorites | Contacts, providers, products, saved items |
| LP-11 | Static content page | Legal pages, about, help articles, FAQs |
| LP-12 | OTP / verification page | Phone verify, email verify, 2FA input |
| LP-13 | Hero landing page | Marketing home, app entry, feature showcase |
| LP-14 | Summary / confirmation page | Order review, booking confirm, checkout summary |
| LP-15 | Feedback / rating form | Post-purchase review, NPS survey, support rating |

---

## LP-1: Centered Single-Card Form

```
┌──────────────────────────────────┐
│         [Logo / Icon]            │
│         "Page Title"             │
│         Description text         │
│  ┌──────────────────────────┐   │
│  │ Label                     │   │
│  │ [___________________]     │   │
│  │ Label                     │   │
│  │ [___________________]     │   │
│  │                           │   │
│  │ [  Primary Button    ]    │   │
│  └──────────────────────────┘   │
│    Secondary link / OAuth btns   │
└──────────────────────────────────┘
```

**Structure:** max-w-md centered card. Optional logo/icon above. Form fields with labels. Primary CTA. Footer links or OAuth buttons.
**Use for:** Authentication, single-purpose forms, verification screens.

---

## LP-2: Stepper-Guided Multi-Step

```
┌──────────────────────────────────────┐
│  Step 1 ─── Step 2 ─── Step 3 ...   │  stepper
├──────────────────────────────────────┤
│  "Step Title"                        │
│  ┌──────────────────────────────┐   │
│  │ Selection / Form content      │   │  card body
│  └──────────────────────────────┘   │
│  [← Back]              [Next →]     │  nav buttons
└──────────────────────────────────────┘
```

**Structure:** Progress stepper at top. Card with step-specific content. Back/Next navigation buttons.
**Use for:** Multi-step forms, checkout, onboarding wizards, booking flows.

---

## LP-3: Tabbed List with Filters

```
┌──────────────────────────────────────┐
│  "Title"                 [CTA Btn]   │
├──────────────────────────────────────┤
│  [Tab 1 | Tab 2]                     │
│  [Filter ▼]  [Filter ▼]             │
├──────────────────────────────────────┤
│  ┌──────────────────────────────┐   │
│  │ Card item           [Badge]  │   │
│  │ secondary text               │   │
│  └──────────────────────────────┘   │
│  ┌──────────────────────────────┐   │
│  │ Card item           [Badge]  │   │
│  └──────────────────────────────┘   │
└──────────────────────────────────────┘
```

**Structure:** Title row with optional CTA. Tabs for categories. Filter dropdowns. Card-based list items. Must handle loading/empty/populated/error states.
**Use for:** Lists with categories (upcoming/past, active/archived, open/closed).

---

## LP-4: Detail Page with Read-Only Rows

```
┌──────────────────────────────────────┐
│ ← Back link                          │
├──────────────────────────────────────┤
│ "Detail Title"           [Badge]     │
│ Subtitle / timestamp                 │
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │
│ │ Icon Label        Value          │ │
│ │ ────────────────────────────     │ │
│ │ Icon Label        Value          │ │
│ │ ────────────────────────────     │ │
│ │ Icon Label        Value          │ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│ [Action 1] [Action 2] [Action 3]    │
└──────────────────────────────────────┘
```

**Structure:** Back link. Title + status badge. Card with icon-labeled rows separated by dividers. Conditional action buttons.
**Use for:** Order detail, item detail, appointment detail, invoice view.

---

## LP-5: Dashboard with Widget Sections

```
┌──────────────────────────────────────┐
│ "Welcome"                [Icon]      │
│ [Primary CTA Button]                 │
├──────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│ │ Stat 1  │ │ Stat 2  │ │ Stat 3  │ │  stat cards
│ └─────────┘ └─────────┘ └─────────┘ │
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │
│ │ Section: Primary Widget          │ │  widget
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ Section: Secondary Widget        │ │  widget
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

**Structure:** Header with greeting/CTA. Grid of stat cards. Stacked widget cards. Each section has own loading state.
**Use for:** Home dashboard, admin overview, analytics page.

---

## LP-6: Sectioned Form Page

```
┌──────────────────────────────────────┐
│ "Form Title"                         │
├──────────────────────────────────────┤
│ Section 1 heading                    │
│ [field] [field]                      │
│ ─────────────────────────────────    │
│ Section 2 heading                    │
│ [field] [field] [field]              │
│ ─────────────────────────────────    │
│ Section 3 heading                    │
│ [toggle] [field]                     │
├──────────────────────────────────────┤
│ [Save Changes]                       │
└──────────────────────────────────────┘
```

**Structure:** Title. Multiple form sections divided by separators. Grid layouts within sections. Save button at bottom.
**Use for:** Profile editing, settings, preferences, account management.

---

## LP-7: List with Inline CRUD

```
┌──────────────────────────────────────┐
│ "Title"                   [+ Add]    │
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │
│ │ Item name        [Edit] [Delete] │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ Inline form (add/edit mode)      │ │
│ │ [field] [field]                  │ │
│ │ [Cancel] [Save]                  │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

**Structure:** Title with Add button. Card list with edit/delete actions. Inline form card for create/edit. Delete confirmation dialog.
**Use for:** Addresses, payment methods, team members, dependents, saved items.

---

## LP-8: Data Table with Filters

```
┌──────────────────────────────────────┐
│ "Title"               [Filter ▼]     │
├──────────────────────────────────────┤
│ Col1  │ Col2  │ Col3  │ Status │ Act │
│───────┼───────┼───────┼────────┼─────│
│ data  │ data  │ data  │ [Bdg]  │ [⋯] │
│ data  │ data  │ data  │ [Bdg]  │ [⋯] │
└──────────────────────────────────────┘
```

**Structure:** Title with filter controls. Table with columns. Status badge column. Action buttons per row. Pagination optional.
**Use for:** Admin lists, audit logs, reports, user management.

---

## LP-9: Selection Grid

```
┌──────────────────────────────────────┐
│ "Select an option"                   │
├──────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐           │
│ │  Icon     │ │  Icon     │          │
│ │  Title    │ │  Title    │          │
│ │  Desc     │ │  Desc     │          │
│ └──────────┘ └──────────┘           │
│ ┌──────────┐ ┌──────────┐           │
│ │  Icon     │ │  Icon     │          │
│ │  Title    │ │  Title    │          │
│ └──────────┘ └──────────┘           │
└──────────────────────────────────────┘
```

**Structure:** Title. Responsive grid of selectable cards. Selected card highlighted with primary border + check icon.
**Use for:** Category picker, plan selector, service type chooser, option grid.

---

## LP-10: Searchable List with Favorites

```
┌──────────────────────────────────────┐
│ "Title"                              │
│ [🔍 Search...                    ]   │
├──────────────────────────────────────┤
│ ★ Favorites                          │
│ ┌──────────────────────────────────┐ │
│ │ Item with heart/star icon        │ │
│ └──────────────────────────────────┘ │
│ ─────── All ────────                 │
│ ┌──────────────────────────────────┐ │
│ │ Item with action buttons         │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

**Structure:** Search input. Favorites section. Separator. All items section. Per-item action buttons.
**Use for:** Contacts, providers, products, saved/bookmarked items.

---

## LP-11: Static Content Page

```
┌──────────────────────────────────────┐
│ ← Back                               │
│ "Page Title"                         │
├──────────────────────────────────────┤
│ ## Section 1                         │
│ Paragraph text...                    │
│ - list item                          │
│ - list item                          │
│                                      │
│ ## Section 2                         │
│ Paragraph text...                    │
└──────────────────────────────────────┘
```

**Structure:** Back link. Title. Static content sections with headings and lists. No data fetching.
**Use for:** Legal pages (privacy, terms, imprint), about, help articles, FAQs.

---

## LP-12: OTP / Verification Page

```
┌──────────────────────────────────────┐
│         [Icon / Illustration]        │
│         "Verify your phone"          │
│         Description text             │
│  ┌──────────────────────────────┐   │
│  │  [ _ ] [ _ ] [ _ ] [ _ ]     │   │  OTP input
│  └──────────────────────────────┘   │
│         00:59 remaining              │  countdown
│         [Resend code]                │
│  [  Verify  ]                        │
└──────────────────────────────────────┘
```

**Structure:** Icon/illustration. Title + description. OTP input or verification message. Countdown timer. Resend link. Submit button.
**Use for:** Phone verification, email verification, 2FA confirmation.

---

## LP-13: Hero Landing Page

```
┌──────────────────────────────────────┐
│              [Logo]                  │
│         "Main Headline"             │
│      Subtitle / value prop          │
│                                      │
│      [  Primary CTA  ]              │
│      [  Secondary link ]             │
├──────────────────────────────────────┤
│  Feature 1  │  Feature 2  │  Feat 3 │  optional
└──────────────────────────────────────┘
```

**Structure:** Centered hero with logo, headline, description. Primary CTA button. Optional secondary link. Optional feature highlights.
**Use for:** App entry, marketing home, feature showcase.

---

## LP-14: Summary / Confirmation Page

```
┌──────────────────────────────────────┐
│  Progress indicator (final step)     │
├──────────────────────────────────────┤
│  "Review Your [Action]"             │
│  ┌──────────────────────────────┐   │
│  │ Field 1:  Value       [Edit] │   │
│  │ ────────────────────────     │   │
│  │ Field 2:  Value       [Edit] │   │
│  │ ────────────────────────     │   │
│  │ Field 3:  Value       [Edit] │   │
│  └──────────────────────────────┘   │
│  ☑ Terms / consent checkbox          │
│  [← Back]    [  Submit  ]           │
└──────────────────────────────────────┘
```

**Structure:** Stepper/progress at top. Summary card with edit links per row. Optional consent checkbox. Back + Submit buttons.
**Use for:** Order review, booking confirmation, checkout summary, form review.

---

## LP-15: Feedback / Rating Form

```
┌──────────────────────────────────────┐
│ ← Back                               │
│ "Rate your experience"               │
│  ┌──────────────────────────────┐   │
│  │ Context card (what to rate)   │   │
│  └──────────────────────────────┘   │
│  ★ ★ ★ ★ ☆                          │  rating
│  [Additional comments...         ]   │  textarea
│  [  Submit  ]                        │
└──────────────────────────────────────┘
```

**Structure:** Back link. Title. Context card showing what's being rated. Star/emoji rating input. Comments textarea. Submit button.
**Use for:** Post-purchase review, NPS survey, support rating, feedback form.
