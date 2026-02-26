# Redeem Prescription Flow

**Source:** User request — APO group prescription redemption via NFC insurance card
**Flow:** 5 screens (step 1–5)
**Content directory:** `content/prescription/`

---

## Flow Overview

```
[1. NFC Scan] → [2. Prescription List] → [3. Delivery Method] → [4. Location/Address] → [5. Confirmation]
                                                                   ↑ conditional:
                                                                   pickup → Apotheke picker
                                                                   delivery → address form
```

---

## Screen 1: `/prescription/scan` — NFC Insurance Card Scan

**File:** `content/prescription/scan.mdx`
**Layout pattern:** LP-12 adapted (verification/action prompt)

### Navigation Context

- **Flow:** Redeem Prescription (step 1 of 5)
- **Previous:** main menu / home (entry point)
- **Next:** /prescription/list (on successful scan)
- **Back target:** previous screen
- **Stepper:** Show steps 1–5, highlight step 1
- **Guard:** none
- **On success:** mock NFC scan completes → navigate to prescription list

### Elements

| # | Element | Type | Data / Content |
|---|---------|------|----------------|
| 1 | Screen header | ScreenHeader | title: "Redeem Prescription" |
| 2 | Stepper | Visual | Steps: Scan → Select → Delivery → Location → Confirm |
| 3 | NFC illustration | Visual | Animated phone + card illustration (CSS animation) |
| 4 | Instruction title | Text | "Hold your insurance card near your phone" |
| 5 | Instruction subtitle | Text | "Place your eGK (elektronische Gesundheitskarte) on the back of your device" |
| 6 | Scanning indicator | Visual | Pulsing animation when "scanning" — shown during simulated scan |
| 7 | Success animation | Visual | Checkmark animation on successful scan |
| 8 | Error note | Note (error) | "Card not recognized. Please try again." |
| 9 | Simulate scan button | Button | "Simulate NFC Scan" — triggers mock scan (since preview tool) |
| 10 | APO group logo/badge | Visual | Small "Powered by APO group" branding at bottom |

### States

- [x] **idle** — Default state: illustration + instruction + scan button
- [x] **scanning** — Pulsing animation, instruction changes to "Reading card...", button disabled
- [x] **success** — Checkmark animation, "Card verified!" text, auto-navigates to next step after 1.5s
- [x] **error** — Error note shown, "Try Again" button replaces scan button

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
│  ● ─── ○ ─── ○ ─── ○ ─── ○              │  stepper
│  Scan  Select Delivery Location Confirm  │
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

**File:** `content/prescription/list.mdx`
**Layout pattern:** LP-3 adapted (list with checkboxes instead of tabs)

### Navigation Context

- **Flow:** Redeem Prescription (step 2 of 5)
- **Previous:** /prescription/scan
- **Next:** /prescription/delivery (on "Continue" with ≥1 selected)
- **Back target:** /prescription/scan
- **Stepper:** Show steps 1–5, highlight step 2
- **Guard:** NFC scan completed (insurance data in flow state)
- **On success:** selected prescriptions stored in flow state → navigate to delivery

### Elements

| # | Element | Type | Data / Content |
|---|---------|------|----------------|
| 1 | Screen header | ScreenHeader | title: "Your Prescriptions" |
| 2 | Stepper | Visual | Steps 1–5, highlight step 2 |
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

- [x] **loading** — Skeleton cards while prescriptions load
- [x] **populated** — List of prescription cards with checkboxes
- [x] **empty** — "No prescriptions found for your insurance card." + Note with info

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
│  ○ ─── ● ─── ○ ─── ○ ─── ○              │  stepper
│  Scan  Select Delivery Location Confirm  │
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

## Screen 3: `/prescription/delivery` — Choose Delivery Method

**File:** `content/prescription/delivery.mdx`
**Layout pattern:** LP-9 (Selection grid)

### Navigation Context

- **Flow:** Redeem Prescription (step 3 of 5)
- **Previous:** /prescription/list
- **Next:** /prescription/location (on selection)
- **Back target:** /prescription/list
- **Stepper:** Show steps 1–5, highlight step 3
- **Guard:** ≥1 prescription selected
- **On success:** delivery method stored → navigate to location step

### Elements

| # | Element | Type | Data / Content |
|---|---------|------|----------------|
| 1 | Screen header | ScreenHeader | title: "Delivery Method" |
| 2 | Stepper | Visual | Steps 1–5, highlight step 3 |
| 3 | Instruction text | Text | "How would you like to receive your medication?" |
| 4 | Delivery option card | RadioCard | Icon: 🚚, title: "Home Delivery", description: "Delivered to your address within 1–3 business days" |
| 5 | Pickup option card | RadioCard | Icon: 🏪, title: "Apotheke Pickup", description: "Pick up at a nearby APO group Apotheke — often same day" |
| 6 | Continue button | Footer + Button | "Continue" — disabled when no option selected |

### States

- [x] **default** — Both cards unselected, continue disabled
- [x] **selected** — One card highlighted with primary border, continue enabled

**Conditional elements:**
- Continue button enabled only when an option is selected
- Selected card shows check icon + teal border

### Data

**Reads:**
- Flow state: selected prescriptions from step 2

**Writes:**
- Flow state: delivery method ("delivery" | "pickup")
- Navigation: → `/prescription/location`

### Layout Sketch

```
┌──────────────────────────────────────────┐
│ ←  Delivery Method                       │  header
├──────────────────────────────────────────┤
│  ○ ─── ○ ─── ● ─── ○ ─── ○              │  stepper
│  Scan  Select Delivery Location Confirm  │
├──────────────────────────────────────────┤
│                                          │
│  How would you like to receive           │
│  your medication?                        │  instruction
│                                          │
│  ┌──────────────────────────────────────┐│
│  │  🚚  Home Delivery            ○     ││  option 1
│  │  Delivered to your address           ││
│  │  within 1–3 business days            ││
│  └──────────────────────────────────────┘│
│                                          │
│  ┌──────────────────────────────────────┐│
│  │  🏪  Apotheke Pickup          ●     ││  option 2
│  │  Pick up at a nearby APO group       ││  (selected)
│  │  Apotheke — often same day           ││
│  └──────────────────────────────────────┘│
│                                          │
├──────────────────────────────────────────┤
│  [          Continue          ]          │  footer
└──────────────────────────────────────────┘
```

---

## Screen 4: `/prescription/location` — Delivery Address or Apotheke Picker

**File:** `content/prescription/location.mdx`
**Layout pattern:** Custom (conditional: address form OR map + list)

This screen adapts based on the delivery method selected in step 3.

### Navigation Context

- **Flow:** Redeem Prescription (step 4 of 5)
- **Previous:** /prescription/delivery
- **Next:** /prescription/confirmation
- **Back target:** /prescription/delivery
- **Stepper:** Show steps 1–5, highlight step 4
- **Guard:** delivery method selected
- **On success:** location stored → navigate to confirmation

---

### Variant A: Home Delivery — Address Form

**Layout pattern:** LP-6 adapted (sectioned form)

#### Elements

| # | Element | Type | Data / Content |
|---|---------|------|----------------|
| 1 | Screen header | ScreenHeader | title: "Delivery Address" |
| 2 | Stepper | Visual | Steps 1–5, highlight step 4 |
| 3 | Pre-filled address card | Card | Current address from user profile (if available), with "Edit" link |
| 4 | Or: Address form | Form | Street, House number, Postal code, City — input fields |
| 5 | Delivery note textarea | Textarea | Optional: "Delivery instructions (e.g., ring twice)" |
| 6 | Estimated delivery | Text | "Estimated delivery: 1–3 business days" |
| 7 | Continue button | Footer + Button | "Continue" |

#### States

- [x] **prefilled** — Address from profile shown in read-only card with "Change" link
- [x] **editing** — Address form fields editable
- [x] **empty** — No saved address, form fields empty

#### Layout Sketch (Variant A)

```
┌──────────────────────────────────────────┐
│ ←  Delivery Address                      │  header
├──────────────────────────────────────────┤
│  ○ ─── ○ ─── ○ ─── ● ─── ○              │  stepper
│  Scan  Select Delivery Location Confirm  │
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

### Variant B: Apotheke Pickup — Map + Location List

**Layout pattern:** Custom (map + scrollable list)

#### Elements

| # | Element | Type | Data / Content |
|---|---------|------|----------------|
| 1 | Screen header | ScreenHeader | title: "Choose Apotheke" |
| 2 | Stepper | Visual | Steps 1–5, highlight step 4 |
| 3 | Map placeholder | Visual | Static map image or colored rectangle showing Apotheke pins (mock) |
| 4 | Location list | List | Scrollable list of APO group Apotheke locations |
| 5 | Location card (×N) | RadioCard | Apotheke name, address, distance, opening hours, availability badge |
| 6 | Continue button | Footer + Button | "Continue" — disabled when no location selected |

#### Elements Detail — Location Card

Each Apotheke location card shows:
- **Radio selection** — left side
- **Apotheke name** — primary text (e.g., "APO Apotheke Marienplatz")
- **Address** — secondary text (e.g., "Marienplatz 1, 80331 München")
- **Distance** — trailing text (e.g., "0.3 km")
- **Opening hours** — tertiary text (e.g., "Open until 20:00")
- **Availability badge** — AVAILABLE (emerald), LIMITED (amber) — indicates if selected medications are in stock

#### States

- [x] **loading** — Map placeholder + skeleton list
- [x] **populated** — Map with pins + location list
- [x] **selected** — One location highlighted, continue enabled

**Conditional elements:**
- Continue button disabled until a location is selected
- Selected card shows teal border + check icon

#### Layout Sketch (Variant B)

```
┌──────────────────────────────────────────┐
│ ←  Choose Apotheke                       │  header
├──────────────────────────────────────────┤
│  ○ ─── ○ ─── ○ ─── ● ─── ○              │  stepper
│  Scan  Select Delivery Location Confirm  │
├──────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐ │
│ │                                      │ │
│ │        [ Map with pins ]             │ │  map
│ │          📍  📍  📍                  │ │  placeholder
│ │                                      │ │
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

---

## Screen 5: `/prescription/confirmation` — Review & Confirm

**File:** `content/prescription/confirmation.mdx`
**Layout pattern:** LP-14 (Summary / confirmation page)

### Navigation Context

- **Flow:** Redeem Prescription (step 5 of 5)
- **Previous:** /prescription/location
- **Next:** none (terminal) — navigates to success/home after confirmation
- **Back target:** /prescription/location
- **Stepper:** Show steps 1–5, highlight step 5
- **Guard:** location/address selected
- **On success:** mock API call → success toast → navigate to home or order tracking

### Elements

| # | Element | Type | Data / Content |
|---|---------|------|----------------|
| 1 | Screen header | ScreenHeader | title: "Review & Confirm" |
| 2 | Stepper | Visual | Steps 1–5, highlight step 5 |
| 3 | "Prescriptions" section | Text | Section heading |
| 4 | Prescription summary cards | Card(s) | Medication name, dosage — one row per selected prescription |
| 5 | "Delivery" section | Text | Section heading |
| 6 | Delivery method row | ListItem | Method label ("Home Delivery" or "Apotheke Pickup") with [Edit] link → step 3 |
| 7 | Location/address row | ListItem | Address or Apotheke name with [Edit] link → step 4 |
| 8 | Estimated timeline row | ListItem | "1–3 business days" or "Available today" |
| 9 | "Insurance" section | Text | Section heading |
| 10 | Insurance row | ListItem | Insurer name + member ID |
| 11 | Consent checkbox | Checkbox + Text | "I confirm that I am authorized to redeem these prescriptions" |
| 12 | Confirm button | Footer + Button | "Confirm Redemption" — disabled until checkbox checked |

### States

- [x] **populated** — All summary rows filled from flow state
- [x] **submitting** — Confirm button shows loading spinner, all inputs disabled
- [x] **success** — Success illustration + "Prescription redeemed!" message + "Back to Home" button

**Conditional elements:**
- Confirm button disabled until consent checkbox is checked
- Confirm button shows loading state during submission
- Success state replaces entire screen content with success message
- Delivery details adapt based on method (address vs. Apotheke name)

### Data

**Reads:**
- Flow state: all data from steps 1–4 (insurance, prescriptions, delivery method, location)

**Writes:**
- Mock API: simulated prescription redemption call
- Toast: "Prescription successfully redeemed!" on success
- Navigation: → home or order tracking on success

### Layout Sketch

```
┌──────────────────────────────────────────┐
│ ←  Review & Confirm                      │  header
├──────────────────────────────────────────┤
│  ○ ─── ○ ─── ○ ─── ○ ─── ●              │  stepper
│  Scan  Select Delivery Location Confirm  │
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
│  ● ─── ● ─── ● ─── ● ─── ●              │  stepper
│  Scan  Select Delivery Location Confirm  │  (all done)
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

## i18n Keys

```json
{
  "prescription": {
    "flowTitle": "Redeem Prescription",
    "steps": {
      "scan": "Scan",
      "select": "Select",
      "delivery": "Delivery",
      "location": "Location",
      "confirm": "Confirm"
    },
    "scan": {
      "title": "Redeem Prescription",
      "instruction": "Hold your insurance card near your phone",
      "subtitle": "Place your eGK (elektronische Gesundheitskarte) on the back of your device",
      "scanning": "Reading card...",
      "success": "Card verified!",
      "error": "Card not recognized. Please try again.",
      "simulateBtn": "Simulate NFC Scan",
      "tryAgainBtn": "Try Again",
      "poweredBy": "Powered by APO group"
    },
    "list": {
      "title": "Your Prescriptions",
      "selectAll": "Select all ({{count}} prescriptions)",
      "selectedCount": "{{selected}} of {{total}} selected",
      "noResults": "No prescriptions found for your insurance card.",
      "statusReady": "Ready",
      "statusPending": "Pending",
      "statusExpired": "Expired",
      "continue": "Continue"
    },
    "delivery": {
      "title": "Delivery Method",
      "instruction": "How would you like to receive your medication?",
      "homeDelivery": "Home Delivery",
      "homeDeliveryDesc": "Delivered to your address within 1–3 business days",
      "apothekePickup": "Apotheke Pickup",
      "apothekePickupDesc": "Pick up at a nearby APO group Apotheke — often same day",
      "continue": "Continue"
    },
    "location": {
      "deliveryTitle": "Delivery Address",
      "pickupTitle": "Choose Apotheke",
      "savedAddress": "Saved Address",
      "changeAddress": "Change",
      "street": "Street",
      "houseNumber": "House number",
      "postalCode": "Postal code",
      "city": "City",
      "deliveryNote": "Delivery instructions (optional)",
      "deliveryNotePlaceholder": "e.g., ring twice",
      "estimatedDelivery": "Estimated delivery: 1–3 business days",
      "nearbyCount": "{{count}} Apotheken nearby",
      "openUntil": "Open until {{time}}",
      "available": "Available",
      "limited": "Limited",
      "continue": "Continue"
    },
    "confirmation": {
      "title": "Review & Confirm",
      "prescriptionsSection": "Prescriptions",
      "deliverySection": "Delivery",
      "insuranceSection": "Insurance",
      "memberId": "Member ID: {{id}}",
      "edit": "Edit",
      "availableToday": "Available today",
      "estimatedDays": "1–3 business days",
      "consent": "I confirm that I am authorized to redeem these prescriptions",
      "confirmBtn": "Confirm Redemption",
      "submitting": "Processing...",
      "successTitle": "Prescription Redeemed!",
      "successPickup": "Your medication will be ready for pickup at {{location}}.",
      "successDelivery": "Your medication will be delivered to {{address}} within 1–3 business days.",
      "backToHome": "Back to Home"
    }
  }
}
```

---

## Mock Data

```typescript
// Prescription list mock
const mockPrescriptions = [
  {
    id: "rx-001",
    medication: "Ibuprofen 400mg",
    dosage: "1 tablet, 3× daily",
    doctor: "Dr. Schmidt",
    date: "2026-02-20",
    status: "ready" as const,
  },
  {
    id: "rx-002",
    medication: "Amoxicillin 500mg",
    dosage: "1 capsule, 2× daily",
    doctor: "Dr. Weber",
    date: "2026-02-18",
    status: "ready" as const,
  },
  {
    id: "rx-003",
    medication: "Metformin 850mg",
    dosage: "1 tablet, 2× daily",
    doctor: "Dr. Fischer",
    date: "2026-02-25",
    status: "pending" as const,
  },
];

// Apotheke locations mock
const mockApotheken = [
  {
    id: "apo-001",
    name: "APO Apotheke Marienplatz",
    address: "Marienplatz 1, 80331 München",
    distance: "0.3 km",
    openUntil: "20:00",
    availability: "available" as const,
  },
  {
    id: "apo-002",
    name: "APO Apotheke Sendlinger Tor",
    address: "Sendlinger Str. 5, 80331 München",
    distance: "0.8 km",
    openUntil: "18:30",
    availability: "available" as const,
  },
  {
    id: "apo-003",
    name: "APO Apotheke Stachus",
    address: "Karlsplatz 3, 80335 München",
    distance: "1.2 km",
    openUntil: "19:00",
    availability: "limited" as const,
  },
];

// Insurance mock (from NFC scan)
const mockInsurance = {
  insurer: "TK Techniker Krankenkasse",
  memberId: "A123456789",
  type: "GKV",
};
```
