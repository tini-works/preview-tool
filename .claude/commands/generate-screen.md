# Generate MDX Screen

You generate MDX screen content files for the preview-tool.

## Step 1: Load component library

Read `src/content/mdx-components.tsx` to know the EXACT components available and their props. NEVER invent components that don't exist in this file.

**Available components and their props (verify against source):**

| Component | Key Props |
|-----------|-----------|
| `Button` | `variant`: primary/secondary/outline/ghost, `size`: sm/md/lg, `className` |
| `Card` | `className` (use `className="p-0 overflow-hidden"` for card with ListItems) |
| `Input` | `label`, `placeholder`, `type`, `className` |
| `Badge` | `variant`: default/success/warning/error |
| `Note` | `type`: info/warning/error/success |
| `ScreenHeader` | `title`, `subtitle` |
| `ListItem` | `icon` (emoji), `label`, `description`, `required`, `selected`, `trailing` (ReactNode, replaces chevron) |
| `RadioCard` | `selected` (boolean), children = label text |
| `Avatar` | `initials`, `variant`: primary/secondary, `size`: sm/md/lg |
| `Divider` | `label` (optional centered text) |
| `Stack` | `gap`: sm/md/lg, `className` |
| `Textarea` | `label`, `placeholder`, `value`, `maxLength` |
| `Footer` | `className`, sticky bottom bar for action buttons |
| `Variant` | `state` (string), wraps content for each screen state |

## Step 2: Ask structured questions (one at a time)

Ask these in order. Use AskUserQuestion with multiple-choice where possible:

1. **Screen name & path**: "What should this screen be called? Where in `content/` should it live?"
   - e.g., `content/booking/appointments.mdx` or `content/settings/profile.mdx`

2. **Screen purpose**: "What does this screen show? Describe it in one sentence."

3. **Layout structure**: Present a text mockup of the proposed layout using the available components. Ask: "Does this layout look right?"
   ```
   ScreenHeader: "Appointments"
   ├─ Card (list container)
   │  ├─ ListItem: doctor name, date, badge
   │  ├─ ListItem: doctor name, date, badge
   │  └─ ListItem: doctor name, date, badge
   └─ Footer
      └─ Button: "Book New"
   ```

4. **States/variants**: "What states should this screen have?" Propose states based on the screen purpose. Common patterns:
   - List screens: `empty`, `loaded`, `loading`
   - Form screens: `idle`, `filling`, `error`, `success`
   - Detail screens: `default`, `editing`
   - Selection screens: `browsing`, `selected`

5. **Confirm before generating**: Show the full plan:
   - File path
   - States list with descriptions
   - Layout per state (what changes between states)

   Ask: "Ready to generate?"

## Step 3: Generate the MDX file

### File structure rules

```mdx
---
type: screen
states:
  state-name:
    description: What this state shows
---

<ScreenHeader title="Screen Title" />

<Variant state="state-name">
  {/* Content for this state */}
</Variant>
```

### Generation rules

1. **Frontmatter**: Always include `type: screen` and `states` with descriptions
2. **ScreenHeader**: Always first element (outside Variant blocks so it's shared)
3. **Variant blocks**: One per state, wrap ALL content for that state
4. **Stack for layout**: Use `<Stack gap="md" className="p-4">` as the main content wrapper inside each Variant
5. **Card for groups**: Use `<Card className="p-0 overflow-hidden">` when containing ListItems
6. **Footer for actions**: Use `<Footer>` with full-width Button for primary actions
7. **Inline Tailwind**: You MAY use `<div className="...">` for custom layouts not covered by components — but prefer components first
8. **Emoji icons**: Use emoji strings for ListItem `icon` prop
9. **Selected states**: Use teal colors for selected items (`border-teal-500 bg-teal-50`)
10. **Disabled states**: Use `opacity-50` on buttons, `variant="secondary"` for disabled look

### What changes between states

Show meaningful differences:
- **empty**: placeholder text, no data, disabled actions
- **loaded**: real data, enabled actions
- **loading**: spinner text ("Loading..."), disabled actions
- **error**: Note with `type="error"`, retry button
- **selected**: highlighted item with teal border, confirmation text

## Step 4: Write and verify

1. Write the MDX file to the agreed path
2. Run `npx tsc --noEmit` to verify no type errors
3. Report the file path and available states

## Do NOT

- Invent components not in `mdx-components.tsx`
- Skip the layout confirmation step
- Generate without asking about states
- Use raw HTML when a component exists for that purpose
- Create components in the MDX file (all components come from the provider)
