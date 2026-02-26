# Redeem Prescription Flow

**Source:** User request — APO group prescription redemption via NFC insurance card
**Flow:** 4 screens (step 1–4)
**Screen directory:** `src/screens/prescription/`

---

## Flow Overview

```
[1. NFC Scan] → [2. Prescription List] → [3. Delivery & Location] → [4. Confirmation]
                                            ↑ adapts based on selection:
                                            pickup → radio + Apotheke picker
                                            delivery → radio + address form
```

---

## Screen 1: `/prescription/scan` — NFC Insurance Card Scan

**File:** `src/screens/prescription/scan/index.tsx`
**Companion files:** `scenarios.ts`, `flow.ts`
**Layout pattern:** LP-12 adapted (verification/action prompt)
**State model:** flat scenarios (`PrescriptionScanData`)

### Navigation Context

- **Flow:** Redeem Prescription (step 1 of 4)
- **Previous:** main menu / home (entry point)
- **Next:** /prescription/list (on successful scan)
- **Back target:** previous screen
- **Stepper:** Show steps 1–4, highlight step 1
- **Guard:** none
- **On success:** mock NFC scan completes → navigate to prescription list

### Flow Actions

| Trigger | Action | Condition | Target | Target State | Notes |
|---------|--------|-----------|--------|--------------|-------|
| `Button:Simulate NFC Scan` | navigate | — | `/prescription/list` | `populated` | Skips scanning/success animation in flow mode |
| `Button:Try Again` | setState | — | `idle` | — | Resets from error state |

### Elements

| # | Element | Type | Data / Content |
|---|---------|------|----------------|
| 1 | Screen header | ScreenHeader | title: "Redeem Prescription" |
| 2 | Stepper | Visual | Steps: Scan → Select → Delivery → Confirm |
| 3 | NFC illustration | Visual | Animated phone + card illustration (CSS animation) |
| 4 | Instruction title | Text | "Hold your insurance card near your phone" |
| 5 | Instruction subtitle | Text | "Place your eGK (elektronische Gesundheitskarte) on the back of your device" |
| 6 | Scanning indicator | Visual | Pulsing animation when "scanning" — shown during simulated scan |
| 7 | Success animation | Visual | Checkmark animation on successful scan |
| 8 | Error note | Note (error) | "Card not recognized. Please try again." |
| 9 | Simulate scan button | Button | "Simulate NFC Scan" — triggers mock scan (since preview tool) |
| 10 | APO group logo/badge | Visual | Small "Powered by APO group" branding at bottom |

### States

Scenarios: `idle`, `scanning`, `success`, `error`

- [x] **idle** — Default state: illustration + instruction + scan button
- [x] **scanning** — Pulsing animation, instruction changes to "Reading card...", button disabled
- [x] **success** — Checkmark animation, "Card verified!" text, auto-navigates to next step after 1.5s
- [x] **error** — Error note shown, "Try Again" button replaces scan button

**Type:** `PrescriptionScanData = { state: 'idle' | 'scanning' | 'success' | 'error' }`

**Conditional elements:**
- Scanning indicator shown only in `scanning` state
- Success animation shown only in `success` state
- Error note shown only in `error` state
- Scan button text changes: "Simulate NFC Scan" → disabled in scanning → "Try Again" in error

### Data

**Reads:** none (entry point)

**Writes:**
- Mock: sets scanned insurance data in flow state (insurer name, member ID)
- Navigation: → `/prescription/list` on success

### Layout Sketch

```
┌──────────────────────────────────────────┐
│ ←  Redeem Prescription                   │  header
├──────────────────────────────────────────┤
│  ● ─── ○ ─── ○ ─── ○                    │  stepper
│  Scan  Select Delivery Confirm           │
├──────────────────────────────────────────┤
│                                          │
│           ┌──────────┐                   │
│           │  ╔═══╗   │                   │
│           │  ║NFC║   │  phone + card     │
│           │  ╚═══╝   │  illustration     │
│           │   📱     │  (animated)       │
│           └──────────┘                   │
│                                          │
│   "Hold your insurance card             │
│    near your phone"                      │  instruction
│                                          │
│   Place your eGK on the back            │
│   of your device                         │  subtitle
│                                          │
│   [    Simulate NFC Scan    ]            │  action btn
│                                          │
│        Powered by APO group              │  branding
└──────────────────────────────────────────┘
```

---

## Screen 2: `/prescription/list` — Select Prescriptions

**File:** `src/screens/prescription/list/index.tsx`
**Companion files:** `scenarios.ts`, `flow.ts`
**Layout pattern:** LP-3 adapted (list with checkboxes instead of tabs)
**State model:** regions (`prescriptions` region, `PrescriptionListData`)

### Navigation Context

- **Flow:** Redeem Prescription (step 2 of 4)
- **Previous:** /prescription/scan
- **Next:** /prescription/delivery (on "Continue" with ≥1 selected)
- **Back target:** /prescription/scan
- **Stepper:** Show steps 1–4, highlight step 2
- **Guard:** NFC scan completed (insurance data in flow state)
- **On success:** selected prescriptions stored in flow state → navigate to delivery

### Flow Actions

| Trigger | Action | Condition | Target | Target State | Notes |
|---------|--------|-----------|--------|--------------|-------|
| `Button:Continue` | navigate | — | `/prescription/delivery` | `none-selected` | Always resets delivery selection |
| `ScreenHeader:Your Prescriptions` | navigate | — | `/prescription/scan` | `idle` | Back navigation via header |

### Elements

| # | Element | Type | Data / Content |
|---|---------|------|----------------|
| 1 | Screen header | ScreenHeader | title: "Your Prescriptions" |
| 2 | Stepper | Visual | Steps 1–4, highlight step 2 |
| 3 | Insurance info banner | Card | Insurer name + member ID from scan (read-only) |
| 4 | Select all toggle | Checkbox + Text | "Select all (N prescriptions)" |
| 5 | Prescription card (×N) | Card + Checkbox | Medication name, dosage, prescribing doctor, date, status badge |
| 6 | Selected count | Text | "N of M selected" |
| 7 | Continue button | Footer + Button | "Continue" — disabled when 0 selected |

### Elements Detail — Prescription Card

Each prescription card shows:
- **Checkbox** — left side, selectable
- **Medication name** — primary text (e.g., "Ibuprofen 400mg")
- **Dosage instructions** — secondary text (e.g., "1 tablet, 3× daily")
- **Prescribing doctor** — tertiary text (e.g., "Dr. Schmidt")
- **Prescription date** — (e.g., "20 Feb 2026")
- **Status badge** — READY (emerald), PENDING (amber), EXPIRED (red)
- Only READY prescriptions are selectable; PENDING/EXPIRED are visually muted with checkbox disabled

### States

Region: `prescriptions` — states: `loading`, `empty`, `populated`

- [x] **loading** — Skeleton cards while prescriptions load
- [x] **populated** — List of prescription cards with checkboxes
- [x] **empty** — "No prescriptions found for your insurance card." + Note with info

**Type:**
```typescript
type Prescription = { id: string; medication: string; dosage: string; doctor: string; date: string; status: 'ready' | 'pending' | 'expired' }
type PrescriptionListData = { view: 'loading' | 'empty' | 'populated'; insurer: string; memberId: string; prescriptions: Prescription[]; selectedIds: string[] }
```

**Conditional elements:**
- Continue button disabled when 0 prescriptions selected
- "Select all" only selects READY prescriptions
- PENDING/EXPIRED cards have reduced opacity + disabled checkbox

### Data

**Reads:**
- Mock prescription list: `{ id, medication, dosage, doctor, date, status }[]`
- Flow state: insurance info from step 1

**Writes:**
- Flow state: selected prescription IDs
- Navigation: → `/prescription/delivery`

### Layout Sketch

```
┌──────────────────────────────────────────┐
│ ←  Your Prescriptions                    │  header
├──────────────────────────────────────────┤
│  ○ ─── ● ─── ○ ─── ○                    │  stepper
│  Scan  Select Delivery Confirm           │
├──────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐ │
│ │ 🏥 TK Techniker        A123456789   │ │  insurance
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ ☑ Select all (3 prescriptions)           │
├──────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐ │
│ │ ☑  Ibuprofen 400mg        [READY]   │ │
│ │    1 tablet, 3× daily               │ │
│ │    Dr. Schmidt · 20 Feb 2026        │ │
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │ ☑  Amoxicillin 500mg      [READY]   │ │
│ │    1 capsule, 2× daily              │ │
│ │    Dr. Weber · 18 Feb 2026          │ │
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │ ☐  Metformin 850mg        [PENDING] │ │  muted
│ │    1 tablet, 2× daily               │ │
│ │    Dr. Fischer · 25 Feb 2026        │ │
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│  2 of 3 selected                         │
│  [          Continue          ]          │  footer
└──────────────────────────────────────────┘
```

---

## Screen 3: `/prescription/delivery` — Delivery & Location

**File:** `src/screens/prescription/delivery/index.tsx`
**Companion files:** `scenarios.ts`, `flow.ts`
**Layout pattern:** LP-9 adapted (selection grid + conditional detail section)
**State model:** regions (`delivery` region, `PrescriptionDeliveryData`)

This screen combines delivery method selection with the corresponding location input. The top section shows the delivery method radio cards; the bottom section dynamically renders the address form (home delivery) or Apotheke picker (pickup) based on selection.

### Navigation Context

- **Flow:** Redeem Prescription (step 3 of 4)
- **Previous:** /prescription/list
- **Next:** /prescription/confirmation
- **Back target:** /prescription/list
- **Stepper:** Show steps 1–4, highlight step 3
- **Guard:** ≥1 prescription selected
- **On success:** delivery method + location stored → navigate to confirmation

### Flow Actions

| Trigger | Action | Condition | Target | Target State | Notes |
|---------|--------|-----------|--------|--------------|-------|
| `RadioCard:Home Delivery` | setState | — | `home-delivery-prefilled` | — | Shows address form variant below radio cards |
| `RadioCard:Apotheke Pickup` | setState | — | `apotheke-loading` | — | Shows Apotheke picker variant below radio cards |
| `Button:Continue` | navigate | — | `/prescription/confirmation` | `review-pickup` | **Bug:** always sends `review-pickup` — see Known Limitations |
| `ScreenHeader:Delivery` | navigate | — | `/prescription/list` | `populated` | Back navigation via header |

### Elements — Delivery Method (top section, always visible)

| # | Element | Type | Data / Content |
|---|---------|------|----------------|
| 1 | Screen header | ScreenHeader | title: "Delivery" |
| 2 | Stepper | Visual | Steps 1–4, highlight step 3 |
| 3 | Instruction text | Text | "How would you like to receive your medication?" |
| 4 | Delivery option card | RadioCard | Icon: 🚚, title: "Home Delivery", description: "Delivered to your address within 1–3 business days" |
| 5 | Pickup option card | RadioCard | Icon: 🏪, title: "Apotheke Pickup", description: "Pick up at a nearby APO group Apotheke — often same day" |

### Elements — Variant A: Home Delivery (shown when home delivery selected)

| # | Element | Type | Data / Content |
|---|---------|------|----------------|
| 6a | Divider | Visual | Separates method selection from detail section |
| 7a | Pre-filled address card | Card | Current address from user profile (if available), with "Change" link |
| 8a | Or: Address form | Form | Street, House number, Postal code, City — input fields |
| 9a | Delivery note textarea | Textarea | Optional: "Delivery instructions (e.g., ring twice)" |
| 10a | Estimated delivery | Text | "Estimated delivery: 1–3 business days" |

### Elements — Variant B: Apotheke Pickup (shown when pickup selected)

| # | Element | Type | Data / Content |
|---|---------|------|----------------|
| 6b | Divider | Visual | Separates method selection from detail section |
| 7b | Map placeholder | Visual | Static map image or colored rectangle showing Apotheke pins (mock) |
| 8b | Location count | Text | "N Apotheken nearby" |
| 9b | Location card (×N) | RadioCard | Apotheke name, address, distance, opening hours, availability badge |

### Elements — Footer (always visible)

| # | Element | Type | Data / Content |
|---|---------|------|----------------|
| 11 | Continue button | Footer + Button | "Continue" — disabled when no method selected, or when pickup selected but no Apotheke chosen |

### Elements Detail — Location Card

Each Apotheke location card shows:
- **Radio selection** — left side
- **Apotheke name** — primary text (e.g., "APO Apotheke Marienplatz")
- **Address** — secondary text (e.g., "Marienplatz 1, 80331 München")
- **Distance** — trailing text (e.g., "0.3 km")
- **Opening hours** — tertiary text (e.g., "Open until 20:00")
- **Availability badge** — AVAILABLE (emerald), LIMITED (amber) — indicates if selected medications are in stock

### States

Region: `delivery` — states: `none-selected`, `home-delivery-prefilled`, `home-delivery-empty`, `apotheke-loading`, `apotheke-list`, `apotheke-selected`

- [x] **none-selected** — Radio cards shown, no detail section below, continue disabled
- [x] **home-delivery-prefilled** — Home delivery selected, saved address shown in card with "Change" link, continue enabled
- [x] **home-delivery-empty** — Home delivery selected, empty address form, continue enabled once address filled
- [x] **apotheke-loading** — Pickup selected, map placeholder + skeleton list below radio cards
- [x] **apotheke-list** — Pickup selected, Apotheke list shown, none selected, continue disabled
- [x] **apotheke-selected** — Pickup selected, one Apotheke highlighted, continue enabled

**Type:**
```typescript
type Apotheke = { id: string; name: string; address: string; distance: string; openUntil: string; availability: 'available' | 'limited' }
type PrescriptionDeliveryData = {
  selected: 'none' | 'delivery' | 'pickup'
  savedAddress?: string
  deliveryNote?: string
  pickupView?: 'loading' | 'list' | 'selected'
  apotheken?: Apotheke[]
  selectedApothekeId?: string
}
```

**Conditional elements:**
- Detail section hidden when `none-selected`
- Address form vs. Apotheke picker determined by radio selection
- Continue button disabled when: no method selected, or pickup with no Apotheke chosen
- Selected Apotheke card shows teal border + check icon

### Data

**Reads:**
- Flow state: selected prescriptions from step 2

**Writes:**
- Flow state: delivery method + address or selected Apotheke
- Navigation: → `/prescription/confirmation`

### Layout Sketch (Pickup variant — most complex)

```
┌──────────────────────────────────────────┐
│ ←  Delivery                              │  header
├──────────────────────────────────────────┤
│  ○ ─── ○ ─── ● ─── ○                    │  stepper
│  Scan  Select Delivery Confirm           │
├──────────────────────────────────────────┤
│                                          │
│  How would you like to receive           │
│  your medication?                        │  instruction
│                                          │
│  ┌──────────────────────────────────────┐│
│  │  🚚  Home Delivery            ○     ││  option 1
│  │  Delivered within 1–3 days           ││
│  └──────────────────────────────────────┘│
│                                          │
│  ┌──────────────────────────────────────┐│
│  │  🏪  Apotheke Pickup          ●     ││  option 2
│  │  Often same day                      ││  (selected)
│  └──────────────────────────────────────┘│
│                                          │
├──────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐ │
│ │        [ Map with pins ]             │ │  map
│ │          📍  📍  📍                  │ │  placeholder
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ 3 Apotheken nearby                       │
├──────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐ │
│ │ ●  APO Apotheke Marienplatz  0.3 km │ │  selected
│ │    Marienplatz 1, 80331 München      │ │
│ │    Open until 20:00    [AVAILABLE]   │ │
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │ ○  APO Apotheke Sendlinger   0.8 km │ │
│ │    Sendlinger Str. 5, 80331 München  │ │
│ │    Open until 18:30    [AVAILABLE]   │ │
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │ ○  APO Apotheke Stachus     1.2 km  │ │
│ │    Karlsplatz 3, 80335 München       │ │
│ │    Open until 19:00    [LIMITED]     │ │
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│  [          Continue          ]          │  footer
└──────────────────────────────────────────┘
```

### Layout Sketch (Home delivery variant)

```
┌──────────────────────────────────────────┐
│ ←  Delivery                              │  header
├──────────────────────────────────────────┤
│  ○ ─── ○ ─── ● ─── ○                    │  stepper
│  Scan  Select Delivery Confirm           │
├──────────────────────────────────────────┤
│                                          │
│  How would you like to receive           │
│  your medication?                        │  instruction
│                                          │
│  ┌──────────────────────────────────────┐│
│  │  🚚  Home Delivery            ●     ││  option 1
│  │  Delivered within 1–3 days           ││  (selected)
│  └──────────────────────────────────────┘│
│                                          │
│  ┌──────────────────────────────────────┐│
│  │  🏪  Apotheke Pickup          ○     ││  option 2
│  │  Often same day                      ││
│  └──────────────────────────────────────┘│
│                                          │
├──────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐ │
│ │ 📍 Saved Address           [Change] │ │
│ │    Marienplatz 1                     │ │  address
│ │    80331 München                     │ │  card
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│  Delivery instructions (optional)        │
│  ┌──────────────────────────────────────┐│
│  │ e.g., ring twice                     ││  textarea
│  └──────────────────────────────────────┘│
│                                          │
│  📦 Estimated delivery: 1–3 business days│
│                                          │
├──────────────────────────────────────────┤
│  [          Continue          ]          │  footer
└──────────────────────────────────────────┘
```

---

## Screen 4: `/prescription/confirmation` — Review & Confirm

**File:** `src/screens/prescription/confirmation/index.tsx`
**Companion files:** `scenarios.ts`, `flow.ts`
**Layout pattern:** LP-14 (Summary / confirmation page)
**State model:** regions (`confirmation` region, `PrescriptionConfirmationData`)

### Navigation Context

- **Flow:** Redeem Prescription (step 4 of 4)
- **Previous:** /prescription/delivery
- **Next:** none (terminal) — navigates to success/home after confirmation
- **Back target:** /prescription/delivery
- **Stepper:** Show steps 1–4, highlight step 4
- **Guard:** delivery method + location selected
- **On success:** mock API call → success toast → navigate to home or order tracking

### Flow Actions

| Trigger | Action | Condition | Target | Target State | Notes |
|---------|--------|-----------|--------|--------------|-------|
| `Button:Confirm Redemption` | setState | — | `success-pickup` | — | **Bug:** always sets `success-pickup` regardless of delivery method — see Known Limitations |
| `Button:Back to Home` | navigate | — | `/prescription/scan` | `idle` | Returns to flow entry point |
| `ScreenHeader:Review & Confirm` | navigate | — | `/prescription/delivery` | `apotheke-selected` | Back navigation via header |

### Elements

| # | Element | Type | Data / Content |
|---|---------|------|----------------|
| 1 | Screen header | ScreenHeader | title: "Review & Confirm" |
| 2 | Stepper | Visual | Steps 1–4, highlight step 4 |
| 3 | "Prescriptions" section | Text | Section heading |
| 4 | Prescription summary cards | Card(s) | Medication name, dosage — one row per selected prescription |
| 5 | "Delivery" section | Text | Section heading |
| 6 | Delivery method row | ListItem | Method label ("Home Delivery" or "Apotheke Pickup") with [Edit] link → step 3 |
| 7 | Location/address row | ListItem | Address or Apotheke name with [Edit] link → step 3 |
| 8 | Estimated timeline row | ListItem | "1–3 business days" or "Available today" |
| 9 | "Insurance" section | Text | Section heading |
| 10 | Insurance row | ListItem | Insurer name + member ID |
| 11 | Consent checkbox | Checkbox + Text | "I confirm that I am authorized to redeem these prescriptions" |
| 12 | Confirm button | Footer + Button | "Confirm Redemption" — disabled until checkbox checked |

### States

Region: `confirmation` — states: `review-pickup`, `review-delivery`, `submitting`, `success-pickup`, `success-delivery`

- [x] **review-pickup** — Summary with pickup details, consent checkbox unchecked
- [x] **review-delivery** — Summary with delivery address details, consent checkbox unchecked
- [x] **submitting** — Confirm button shows loading spinner, all inputs disabled
- [x] **success-pickup** — Success illustration + pickup confirmation message + "Back to Home" button
- [x] **success-delivery** — Success illustration + delivery confirmation message + "Back to Home" button

**Type:**
```typescript
type PrescriptionConfirmationData = {
  state: 'review' | 'submitting' | 'success'
  deliveryMethod: 'delivery' | 'pickup'
  prescriptions: { medication: string; dosage: string }[]
  deliveryLabel: string
  locationLabel: string
  locationDetail?: string
  timeline: string
  insurer: string
  memberId: string
  consentChecked: boolean
}
```

**Conditional elements:**
- Confirm button disabled until consent checkbox is checked
- Confirm button shows loading state during submission
- Success state replaces entire screen content with success message
- Delivery details adapt based on method (address vs. Apotheke name)

### Data

**Reads:**
- Flow state: all data from steps 1–3 (insurance, prescriptions, delivery method, location)

**Writes:**
- Mock API: simulated prescription redemption call
- Toast: "Prescription successfully redeemed!" on success
- Navigation: → home or order tracking on success

### Layout Sketch

```
┌──────────────────────────────────────────┐
│ ←  Review & Confirm                      │  header
├──────────────────────────────────────────┤
│  ○ ─── ○ ─── ○ ─── ●                    │  stepper
│  Scan  Select Delivery Confirm           │
├──────────────────────────────────────────┤
│ PRESCRIPTIONS                            │  section
│ ┌──────────────────────────────────────┐ │
│ │ 💊 Ibuprofen 400mg                  │ │
│ │    1 tablet, 3× daily               │ │
│ │ ─────────────────────────────────── │ │
│ │ 💊 Amoxicillin 500mg                │ │
│ │    1 capsule, 2× daily              │ │
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ DELIVERY                                 │  section
│ ┌──────────────────────────────────────┐ │
│ │ 🏪 Apotheke Pickup          [Edit] │ │
│ │ ─────────────────────────────────── │ │
│ │ 📍 APO Apotheke Marienplatz [Edit] │ │
│ │    Marienplatz 1, 80331 München     │ │
│ │ ─────────────────────────────────── │ │
│ │ 🕐 Available today                  │ │
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ INSURANCE                                │  section
│ ┌──────────────────────────────────────┐ │
│ │ 🏥 TK Techniker Krankenkasse       │ │
│ │    Member ID: A123456789             │ │
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ ☑ I confirm that I am authorized to     │
│   redeem these prescriptions             │  consent
├──────────────────────────────────────────┤
│  [      Confirm Redemption      ]        │  footer
└──────────────────────────────────────────┘
```

### Success State Layout

```
┌──────────────────────────────────────────┐
│ ←  Redeem Prescription                   │  header
├──────────────────────────────────────────┤
│  ● ─── ● ─── ● ─── ●                    │  stepper
│  Scan  Select Delivery Confirm           │  (all done)
├──────────────────────────────────────────┤
│                                          │
│            ┌────────┐                    │
│            │   ✓    │                    │  success
│            └────────┘                    │  icon
│                                          │
│     "Prescription Redeemed!"             │
│                                          │
│     Your medication will be ready        │
│     for pickup at APO Apotheke           │  message
│     Marienplatz.                         │
│                                          │
│     [      Back to Home      ]           │  CTA
│                                          │
└──────────────────────────────────────────┘
```

---

## i18n

All translations are **co-located** in each screen's folder as `en.json` and `de.json`. Namespaces are derived from the file path (section + screen name, hyphenated). There is no centralized i18n file for this flow.

| Screen | Namespace | Files |
|--------|-----------|-------|
| scan | `prescription-scan` | `src/screens/prescription/scan/{en,de}.json` |
| list | `prescription-list` | `src/screens/prescription/list/{en,de}.json` |
| delivery | `prescription-delivery` | `src/screens/prescription/delivery/{en,de}.json` |
| confirmation | `prescription-confirmation` | `src/screens/prescription/confirmation/{en,de}.json` |

Locales are auto-discovered via `import.meta.glob` — no manual registration in `i18n.ts`.

**Note:** The old `prescription-location` namespace is removed. Location-related i18n keys (Apotheke picker labels, address form labels) are merged into `prescription-delivery`.

---

## Mock Data

Each screen's `scenarios.ts` file is the canonical source for types and mock data. Key types are listed here for reference; see the individual files for full mock values.

| Screen | Type | Source |
|--------|------|--------|
| scan | `PrescriptionScanData` | `src/screens/prescription/scan/scenarios.ts` |
| list | `Prescription`, `PrescriptionListData` | `src/screens/prescription/list/scenarios.ts` |
| delivery | `Apotheke`, `PrescriptionDeliveryData` | `src/screens/prescription/delivery/scenarios.ts` |
| confirmation | `ConfirmationPrescription`, `PrescriptionConfirmationData` | `src/screens/prescription/confirmation/scenarios.ts` |

---

## Edge Cases & Known Limitations

### 1. Conditional routing not fully wired

**Affected screens:** delivery (screen 3), confirmation (screen 4)

The `FlowAction` type supports only a single `navigateState` or `setState` per trigger. It does not support conditional routing based on current screen state.

**delivery `Button:Continue`** — Always navigates to `/prescription/confirmation` with state `review-pickup`. Ideal behavior: should send `review-delivery` when home delivery is selected.

**confirmation `Button:Confirm Redemption`** — Always sets state to `success-pickup`. Ideal behavior: should set `success-delivery` when the delivery method is home delivery.

**Root cause:** `FlowAction` interface (`src/flow/types.ts`) maps one trigger → one static action. Conditional logic (e.g., "if current state is X, navigate to Y") is not supported. This would require extending `FlowAction` to accept a condition function or state-dependent target map.

### 2. Region state lost on back-navigation

When `navigateFlow` in the flow store processes a back-navigation, `regionStates` for the target screen are reset to their default. This means navigating back from confirmation to delivery loses the user's Apotheke selection (resets to whatever state the flow action specifies, not the user's actual selection).

### 3. No guard enforcement in preview tool

The spec mentions guards (e.g., "≥1 prescription selected" on delivery, "NFC scan completed" on list) but the preview tool doesn't enforce guards — any screen is accessible directly from the screen catalog regardless of flow state.

---

## Migration Notes (from 5-screen to 4-screen flow)

When implementing this spec:
- **Delete** `src/screens/prescription/location/` (index.tsx, scenarios.ts, flow.ts, en.json, de.json)
- **Merge** location scenarios and flow actions into `src/screens/prescription/delivery/`
- **Update** stepper from 5 steps to 4 steps in all screens
- **Update** confirmation back-navigation target from `/prescription/location` to `/prescription/delivery`
- **Update** delivery flow actions to remove the intermediate navigation to `/prescription/location` — delivery method selection and location input are now internal state transitions within the same screen
