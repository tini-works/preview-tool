# Prescription Flow Design

**Date:** 2026-02-26
**Status:** Approved

## Problem

The 5 Prescription screens have `data-flow-target` attributes in their JSX but no `flow.ts` files. They are not interactive in play mode. Additionally, 3 of the 5 screens use the regions system, and the current `FlowAction.setState` only works with flat scenarios.

## Decision

1. Extend `FlowAction` with `setRegionState` to support region-based screens
2. Create `flow.ts` files for all 5 Prescription screens following the established pattern

## FlowAction Extension

```typescript
export interface FlowAction {
  trigger: string
  setState?: string
  setRegionState?: { region: string; state: string }  // NEW
  navigate?: string
  navigateState?: string
}
```

FlowProvider handles `setRegionState` by calling `setRegionState()` from the devtools store.

## Flow Map

### PrescriptionScan (flat scenarios)

| Trigger | Action |
|---------|--------|
| `Button:Simulate NFC Scan` | setState: `success` |
| `Button:Try Again` | setState: `idle` |
| `ScreenHeader:Redeem Prescription` | navigate: `/prescription-list` |

### PrescriptionList (regions)

| Trigger | Action |
|---------|--------|
| `ScreenHeader:Your Prescriptions` | navigate: `/prescription-scan`, navigateState: `idle` |
| `Button:Continue` | navigate: `/prescription-delivery`, navigateState: `none-selected` |

### PrescriptionDelivery (flat scenarios)

| Trigger | Action |
|---------|--------|
| `ScreenHeader:Delivery Method` | navigate: `/prescription-list` |
| `RadioCard:Home Delivery` | setState: `home-delivery` |
| `RadioCard:Apotheke Pickup` | setState: `apotheke-pickup` |
| `Button:Continue` | navigate: `/prescription-location` |

### PrescriptionLocation (regions)

| Trigger | Action |
|---------|--------|
| `ScreenHeader:Delivery Address` | navigate: `/prescription-delivery`, navigateState: `home-delivery` |
| `ScreenHeader:Choose Apotheke` | navigate: `/prescription-delivery`, navigateState: `apotheke-pickup` |
| `Button:Continue` | navigate: `/prescription-confirmation` |

### PrescriptionConfirmation (regions)

| Trigger | Action |
|---------|--------|
| `ScreenHeader:Review & Confirm` | navigate: `/prescription-location` |
| `Button:Confirm Redemption` | setRegionState: `{ region: 'confirmation', state: 'success-pickup' }` |
| `Button:Back to Home` | navigate: `/prescription-scan`, navigateState: `idle` |

## Files to Create

- `src/screens/PrescriptionScan/flow.ts`
- `src/screens/PrescriptionList/flow.ts`
- `src/screens/PrescriptionDelivery/flow.ts`
- `src/screens/PrescriptionLocation/flow.ts`
- `src/screens/PrescriptionConfirmation/flow.ts`

## Files to Modify

- `src/flow/types.ts` — add `setRegionState` field
- `src/flow/FlowProvider.tsx` — handle `setRegionState` action
