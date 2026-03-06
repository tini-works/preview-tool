# Preview State Control Design

**Date:** 2026-03-06
**Goal:** Make language switching and all region state switching work end-to-end in the preview shell — not just external hook regions, but also local state (useState), derived variables (useSearchParams), and i18n language.

**Problem:** The preview shell's inspector panel has language buttons (en/de) and region state switchers, but:
- Language buttons update Zustand store but nothing calls `i18n.changeLanguage()` on the host app
- Local-state regions (show-password, field-errors) appear in the panel but switching them has no effect — `useState` can't be mocked via module aliasing
- Derived-var regions (registration-success) from `useSearchParams` also can't be switched — no react-router-dom mock exists

**Case study:** LoginPage in the booking app has 4 regions. Only `auth-store` (external hook with mock) responds to panel switching. The other 3 are inert.

---

## Phase 2: Language Sync + Router Mock

### Section 1: Wrapper Language Sync

When the CLI detects `react-i18next` in the host app, the generated `wrapper.tsx` wraps screens with `<I18nextProvider>`. Currently it does NOT sync the preview shell's language state to `i18n.changeLanguage()`.

**Fix:** Update `generate-wrapper.ts` so the react-i18next provider definition generates a sync wrapper:

```tsx
import { I18nextProvider } from 'react-i18next'
import i18n from '@host/i18n'
import { useDevToolsStore } from '@preview-tool/runtime'
import { useEffect } from 'react'

function I18nSyncWrapper({ children }) {
  const language = useDevToolsStore((s) => s.language)
  useEffect(() => {
    i18n.changeLanguage(language)
  }, [language])
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
}
```

The wrapper uses `I18nSyncWrapper` instead of `I18nextProvider` directly.

### Section 2: Router Hook Mocking

For derived vars that trace to `useSearchParams`, generate a mock for `react-router-dom`:

```tsx
// Generated: .preview/mocks/react-router-dom.ts
import { useRegionDataForHook } from '@preview-tool/runtime'
export { Link, NavLink, Outlet, Route, Routes, Navigate } from 'react-router-dom'
export { useNavigate, useLocation, useParams } from 'react-router-dom'

export function useSearchParams() {
  const data = useRegionDataForHook('registration-success')
  if (data) {
    const params = new URLSearchParams()
    if (data.registrationSuccess) params.set('registered', 'true')
    return [params, () => {}] as const
  }
  return [new URLSearchParams(), () => {}] as const
}
```

Vite aliases `react-router-dom` → this mock for preview builds. Non-mocked exports pass through.

**CLI changes:**
- `template-fallback.ts`: Track `sourceVariable` on derived-var regions so mock generator knows to mock react-router-dom
- `generate-mock-from-analysis.ts`: Generate react-router-dom mock when derived vars trace to `useSearchParams`

---

## Phase 3: useState Override via Vite Plugin

### Section 3: `usePreviewState` Runtime Hook

```tsx
// packages/runtime/src/usePreviewState.ts
import { useState, useContext } from 'react'
import { RegionDataContext } from './RegionDataContext'

function camelToKebab(name: string): string {
  return name.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')
}

export function usePreviewState<T>(
  name: string,
  initialValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState(initialValue)
  const ctx = useContext(RegionDataContext)
  const regionKey = camelToKebab(name)
  const regionData = ctx?.regionData?.[regionKey]

  // Panel override takes precedence when active
  if (regionData?.stateData && name in regionData.stateData) {
    return [regionData.stateData[name] as T, setState]
  }

  return [state, setState]
}
```

Always calls real `useState` (Rules of Hooks), but returns panel value when override is active.

### Section 4: Vite Plugin `previewStateTransform`

A Vite plugin applied only to screen component files during `preview dev`. Transforms:

```tsx
// Original:
const [showPassword, setShowPassword] = useState(false)

// Transformed:
const [showPassword, setShowPassword] = usePreviewState('showPassword', false)
```

Plugin behavior:
1. Only targets files listed in screen discovery (not all files)
2. Finds `const [X, Y] = useState(Z)` patterns
3. Replaces `useState` → `usePreviewState` with variable name as first arg
4. Adds `import { usePreviewState } from '@preview-tool/runtime'` at the top

If no region data exists for a variable, `usePreviewState` falls through to normal `useState`.

---

## Files Changed

| File | Change | Phase |
|------|--------|-------|
| `packages/cli/src/resolver/generate-wrapper.ts` | Sync language from Zustand to i18n | 2 |
| `packages/cli/src/generator/generate-mock-from-analysis.ts` | Generate react-router-dom mock | 2 |
| `packages/cli/src/analyzer/template-fallback.ts` | Track sourceVariable on derived-var regions | 2 |
| `packages/runtime/src/usePreviewState.ts` | New hook | 3 |
| `packages/runtime/src/index.ts` | Export usePreviewState | 3 |
| `packages/cli/src/server/vite-plugin-preview-state.ts` | New Vite plugin | 3 |
| `packages/cli/src/server/create-vite-config.ts` | Register plugin | 3 |
| `packages/runtime/src/RegionDataContext.tsx` | Export context for usePreviewState | 3 |

## Phasing

| Phase | What | Result |
|-------|------|--------|
| **Phase 1** (done) | New fact types + unified state derivation | All states appear in model.ts |
| **Phase 2** | Language sync + router mock | Language switching works. `registration-success` switchable |
| **Phase 3** | Vite plugin + usePreviewState | `show-password` and `field-errors` switchable |
