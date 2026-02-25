# Hello World Demo Screen — Design Document

**Date:** 2026-02-25
**Status:** Approved

## Goal

Build a demo Hello World screen to validate the project architecture: src/screens/ folder convention, useScenarios hook, ScenarioSwitcher, react-i18next t(), shadcn/ui components, and list state handling.

## Decisions

| Decision | Choice |
|---|---|
| i18n | Install react-i18next + i18next, set up minimal config |
| Demo content | Greeting card + mock items list (tests all conventions) |
| Routing | Render directly in App.tsx, no router |
| Languages | English (default) + German scenario |

## Files

| Action | File | Purpose |
|--------|------|---------|
| Install | `react-i18next`, `i18next` | i18n library |
| Create | `src/lib/i18n.ts` | i18next initialization |
| Create | `src/locales/en/helloWorld.json` | English translations |
| Create | `src/locales/de/helloWorld.json` | German translations |
| Create | `src/screens/HelloWorld/index.tsx` | Demo screen component |
| Create | `src/screens/HelloWorld/scenarios.ts` | Mock data scenarios |
| Modify | `src/main.tsx` | Import i18n config |
| Modify | `src/App.tsx` | Render HelloWorld screen |

## Screen Content

**Greeting card** (top):
- Title + description via `t()`
- Button (shadcn/ui)

**Items list** (below):
- 3 mock items with id, title, subtitle
- 3 states: loading (skeleton/spinner), empty (message), populated (list)

## Scenarios

```ts
const scenarios = {
  loading:    { label: "Loading",     data: { isLoading: true,  items: [],               lang: "en" } },
  empty:      { label: "Empty",       data: { isLoading: false, items: [],               lang: "en" } },
  populated:  { label: "Populated",   data: { isLoading: false, items: MOCK_ITEMS,       lang: "en" } },
  singleItem: { label: "Single Item", data: { isLoading: false, items: [MOCK_ITEMS[0]], lang: "en" } },
  german:     { label: "German",      data: { isLoading: false, items: MOCK_ITEMS,       lang: "de" } },
}
```

Screen reads `lang` from `active.data` and calls `i18n.changeLanguage(lang)` on change.

## i18n Setup

- `src/lib/i18n.ts` — i18next init with `en` default, load namespaces from `src/locales/`
- Import in `src/main.tsx` before app renders
- Namespace per screen: `useTranslation('helloWorld')`
