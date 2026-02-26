# Prescription Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make all 5 Prescription screens interactive in play mode by creating `flow.ts` files and extending FlowAction to support region-based state changes.

**Architecture:** Extend `FlowAction` with an optional `setRegionState` field. Update `FlowProvider` to call the store's `setRegionState()` when matched. Create 5 per-screen `flow.ts` files following the established Booking screen pattern.

**Tech Stack:** TypeScript, React, Zustand (devtools store)

---

### Task 1: Extend FlowAction type

**Files:**
- Modify: `src/flow/types.ts:1-6`

**Step 1: Add setRegionState field**

Replace the entire file with:

```typescript
export interface FlowAction {
  trigger: string
  setState?: string
  setRegionState?: { region: string; state: string }
  navigate?: string
  navigateState?: string
}
```

**Step 2: Verify no type errors**

Run: `pnpm tsc --noEmit`
Expected: PASS (field is optional, no consumers break)

**Step 3: Commit**

```bash
git add src/flow/types.ts
git commit -m "feat(flow): add setRegionState field to FlowAction type"
```

---

### Task 2: Handle setRegionState in FlowProvider

**Files:**
- Modify: `src/flow/FlowProvider.tsx:13-47`

**Step 1: Add setRegionState selector**

After line 17 (`const navigateFlow = ...`), add:

```typescript
const setRegionState = useDevToolsStore((s) => s.setRegionState)
```

**Step 2: Add setRegionState handling in click handler**

After the existing `if (action.setState && !action.navigate)` block (lines 37-40), add:

```typescript
if (action.setRegionState && !action.navigate) {
  pushFlowHistory(selectedRoute, currentState)
  setRegionState(action.setRegionState.region, action.setRegionState.state)
}
```

**Step 3: Add setRegionState to useCallback dependency array**

Update the dependency array (line 47) to include `setRegionState`:

```typescript
[playMode, actions, selectedRoute, setSelectedState, setRegionState, pushFlowHistory, navigateFlow]
```

**Step 4: Verify no type errors**

Run: `pnpm tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add src/flow/FlowProvider.tsx
git commit -m "feat(flow): handle setRegionState action in FlowProvider"
```

---

### Task 3: Create PrescriptionScan flow.ts

**Files:**
- Create: `src/screens/PrescriptionScan/flow.ts`

**Step 1: Create the flow file**

```typescript
import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'Button:Simulate NFC Scan', setState: 'success' },
  { trigger: 'Button:Try Again', setState: 'idle' },
  { trigger: 'ScreenHeader:Redeem Prescription', navigate: '/prescription-list' },
]
```

**Step 2: Verify no type errors**

Run: `pnpm tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/screens/PrescriptionScan/flow.ts
git commit -m "feat(PrescriptionScan): add flow actions"
```

---

### Task 4: Create PrescriptionList flow.ts

**Files:**
- Create: `src/screens/PrescriptionList/flow.ts`

**Step 1: Create the flow file**

```typescript
import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'ScreenHeader:Your Prescriptions', navigate: '/prescription-scan', navigateState: 'idle' },
  { trigger: 'Button:Continue', navigate: '/prescription-delivery', navigateState: 'none-selected' },
]
```

**Step 2: Verify no type errors**

Run: `pnpm tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/screens/PrescriptionList/flow.ts
git commit -m "feat(PrescriptionList): add flow actions"
```

---

### Task 5: Create PrescriptionDelivery flow.ts

**Files:**
- Create: `src/screens/PrescriptionDelivery/flow.ts`

**Step 1: Create the flow file**

```typescript
import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'ScreenHeader:Delivery Method', navigate: '/prescription-list' },
  { trigger: 'RadioCard:Home Delivery', setState: 'home-delivery' },
  { trigger: 'RadioCard:Apotheke Pickup', setState: 'apotheke-pickup' },
  { trigger: 'Button:Continue', navigate: '/prescription-location' },
]
```

**Step 2: Verify no type errors**

Run: `pnpm tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/screens/PrescriptionDelivery/flow.ts
git commit -m "feat(PrescriptionDelivery): add flow actions"
```

---

### Task 6: Create PrescriptionLocation flow.ts

**Files:**
- Create: `src/screens/PrescriptionLocation/flow.ts`

**Step 1: Create the flow file**

```typescript
import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'ScreenHeader:Delivery Address', navigate: '/prescription-delivery', navigateState: 'home-delivery' },
  { trigger: 'ScreenHeader:Choose Apotheke', navigate: '/prescription-delivery', navigateState: 'apotheke-pickup' },
  { trigger: 'Button:Continue', navigate: '/prescription-confirmation' },
]
```

**Step 2: Verify no type errors**

Run: `pnpm tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/screens/PrescriptionLocation/flow.ts
git commit -m "feat(PrescriptionLocation): add flow actions"
```

---

### Task 7: Create PrescriptionConfirmation flow.ts

**Files:**
- Create: `src/screens/PrescriptionConfirmation/flow.ts`

**Step 1: Create the flow file**

```typescript
import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'ScreenHeader:Review & Confirm', navigate: '/prescription-location' },
  { trigger: 'Button:Confirm Redemption', setRegionState: { region: 'confirmation', state: 'success-pickup' } },
  { trigger: 'Button:Back to Home', navigate: '/prescription-scan', navigateState: 'idle' },
]
```

**Step 2: Verify no type errors**

Run: `pnpm tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/screens/PrescriptionConfirmation/flow.ts
git commit -m "feat(PrescriptionConfirmation): add flow actions"
```

---

### Task 8: Smoke test in browser

**Step 1: Start dev server**

Run: `pnpm dev`

**Step 2: Manual verification checklist**

1. Navigate to PrescriptionScan screen
2. Toggle play mode ON
3. Click "Simulate NFC Scan" button — should switch to `success` state
4. Click ScreenHeader — should navigate to PrescriptionList
5. Click "Continue" button — should navigate to PrescriptionDelivery
6. Click "Home Delivery" radio — should switch to `home-delivery` state
7. Click "Continue" — should navigate to PrescriptionLocation
8. Click "Continue" — should navigate to PrescriptionConfirmation
9. Click "Confirm Redemption" — should switch region to `success-pickup` state
10. Click "Back to Home" — should navigate back to PrescriptionScan with `idle` state

**Step 3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(flow): address smoke test issues"
```
