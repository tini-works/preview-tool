# `/profile` — User Profile

**Source:** User request
**File:** `content/profile.mdx`
**Layout pattern:** LP-4 (Detail page with read-only rows) — see `content/booking/patient.mdx` for insurance/family patterns

---

### Navigation Context

- **Flow:** standalone
- **Previous:** any screen (accessible from main navigation / menu)
- **Next:** none (terminal) | Edit → separate `/profile/edit` screen (future)
- **Back target:** previous screen
- **Guard:** authenticated user
- **On success:** n/a (read-only view)

---

### Elements

| # | Element | Type | Data / Content |
|---|---------|------|----------------|
| 1 | Screen header | ScreenHeader | title: "My Profile" |
| 2 | Avatar + name banner | Avatar + Text | Large avatar (initials), full name, email below |
| 3 | "Personal Information" section label | Text | Section heading |
| 4 | Personal info card | Card + ListItem rows | Full name, Date of birth, Gender, Phone, Email, Address |
| 5 | "Insurance" section label | Text | Section heading |
| 6 | Insurance cards | Card(s) | Type badge (GKV/PKV), insurer name, member ID — one card per insurance |
| 7 | "Family Members" section label | Text | Section heading |
| 8 | Family member list | Card + ListItem rows | Avatar + name + relationship per member. "Add member" row at bottom |
| 9 | "Settings" section label | Text | Section heading |
| 10 | Settings card | Card + ListItem rows | Language (value shown), Notifications (on/off trailing text) |
| 11 | Edit profile button | Footer + Button | "Edit Profile" primary CTA in sticky footer |

---

### States

- [x] **Loading** — "Loading your profile..." message
- [x] **Populated** — All sections filled with user data
- [x] **Minimal** — New user: personal info only, no insurance or family members. Empty-state notes for insurance and family sections with "Add" CTAs

**Conditional elements:**
- Insurance section shows `<Note type="info">` when no insurance cards exist (minimal state)
- Family section shows `<Note type="info">` when no family members (minimal state)
- "Add member" ListItem always visible in family section

---

### Data

**Reads:**
- Mock user object: name, DOB, gender, email, phone, address
- Mock insurance array: `{ type, insurer, memberId }[]`
- Mock family members array: `{ initials, name, relationship }[]`
- Mock settings: `{ language, notificationsEnabled }`

**Writes:** none (read-only view)

---

### Layout Sketch

```
┌──────────────────────────────────────────┐
│ ←  My Profile                            │  header
├──────────────────────────────────────────┤
│       ┌────┐                             │
│       │ SM │                             │  avatar
│       └────┘                             │
│     Sarah Müller                         │
│   sarah.mueller@mail.de                  │
├──────────────────────────────────────────┤
│ PERSONAL INFORMATION                     │  section
│ ┌──────────────────────────────────────┐ │
│ │ 👤  Full name       Sarah Müller     │ │
│ │ ─────────────────────────────────── │ │
│ │ 🎂  Date of birth   15 Mar 1990     │ │
│ │ ─────────────────────────────────── │ │
│ │ ⚥   Gender          Female          │ │
│ │ ─────────────────────────────────── │ │
│ │ 📱  Phone           +49 170 1234567 │ │
│ │ ─────────────────────────────────── │ │
│ │ ✉   Email           sarah.mueller…  │ │
│ │ ─────────────────────────────────── │ │
│ │ 📍  Address          Marienplatz 1…  │ │
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ INSURANCE                                │  section
│ ┌──────────────────────────────────────┐ │
│ │ [GKV] Techniker Krankenkasse        │ │
│ │       A123456789                     │ │
│ │ ─────────────────────────────────── │ │
│ │ [PKV] Debeka                        │ │
│ │       P987654321                     │ │
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ FAMILY MEMBERS                           │  section
│ ┌──────────────────────────────────────┐ │
│ │ (MM) Max Müller          Son       → │ │
│ │ ─────────────────────────────────── │ │
│ │ (LM) Lena Müller        Daughter   → │ │
│ │ ─────────────────────────────────── │ │
│ │ (+)  Add family member             → │ │
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ SETTINGS                                 │  section
│ ┌──────────────────────────────────────┐ │
│ │ 🌐  Language            Deutsch    → │ │
│ │ ─────────────────────────────────── │ │
│ │ 🔔  Notifications       On        → │ │
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ [        Edit Profile        ]           │  footer
└──────────────────────────────────────────┘
```

---

### i18n Keys

```json
{
  "profile": {
    "title": "My Profile",
    "personalInfo": "Personal Information",
    "fullName": "Full name",
    "dateOfBirth": "Date of birth",
    "gender": "Gender",
    "phone": "Phone",
    "email": "Email",
    "address": "Address",
    "insurance": "Insurance",
    "noInsurance": "No insurance cards added yet.",
    "familyMembers": "Family Members",
    "noFamily": "No family members added yet.",
    "addFamilyMember": "Add family member",
    "settings": "Settings",
    "language": "Language",
    "notifications": "Notifications",
    "notificationsOn": "On",
    "notificationsOff": "Off",
    "editProfile": "Edit Profile",
    "loading": "Loading your profile..."
  }
}
```
