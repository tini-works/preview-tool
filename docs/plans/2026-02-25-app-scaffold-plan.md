# Preview Tool — App Scaffold Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Initialize a working Vite + React + TypeScript + Tailwind CSS v4 + shadcn/ui project.

**Architecture:** Vite scaffolds the React-TS app. Tailwind CSS v4 is added via its Vite plugin (no PostCSS config needed). shadcn/ui CLI configures component infrastructure (components.json, CSS variables, cn() utility). Starter components verify the full stack works.

**Tech Stack:** Vite, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, pnpm

---

### Task 1: Scaffold Vite React-TS App

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `.gitignore`

**Step 1: Scaffold the project in the current directory**

Since the directory already has a `.git` and `docs/`, scaffold into a temp directory and move files:

```bash
cd /Users/loclam/Desktop/preview-tool
pnpm create vite@latest temp-scaffold --template react-ts
```

**Step 2: Move scaffolded files into project root**

```bash
# Move all files from temp-scaffold into current directory
cp -r temp-scaffold/* .
cp temp-scaffold/.gitignore .
rm -rf temp-scaffold
```

**Step 3: Install dependencies**

```bash
pnpm install
```

**Step 4: Verify Vite dev server starts**

```bash
pnpm dev &
sleep 3
curl -s http://localhost:5173 | head -5
kill %1
```

Expected: HTML response containing `<div id="root">`.

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite React-TS project"
```

---

### Task 2: Add Tailwind CSS v4

**Files:**
- Modify: `src/index.css`
- Modify: `vite.config.ts`
- Modify: `package.json` (via pnpm add)

**Step 1: Install Tailwind CSS and its Vite plugin**

```bash
pnpm add tailwindcss @tailwindcss/vite
```

**Step 2: Replace `src/index.css` with Tailwind import**

Replace the entire contents of `src/index.css` with:

```css
@import "tailwindcss";
```

**Step 3: Add Tailwind plugin to `vite.config.ts`**

Update `vite.config.ts` to:

```typescript
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

**Step 4: Verify Tailwind works**

Edit `src/App.tsx` temporarily to include a Tailwind class:

```tsx
function App() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <h1 className="text-4xl font-bold text-blue-600">Preview Tool</h1>
    </div>
  )
}

export default App
```

```bash
pnpm dev &
sleep 3
curl -s http://localhost:5173 | head -10
kill %1
```

Expected: Page renders without errors.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Tailwind CSS v4 with Vite plugin"
```

---

### Task 3: Configure TypeScript Path Aliases

**Files:**
- Modify: `tsconfig.json`
- Modify: `tsconfig.app.json`
- Modify: `vite.config.ts`
- Modify: `package.json` (via pnpm add -D)

**Step 1: Install @types/node**

```bash
pnpm add -D @types/node
```

**Step 2: Add path aliases to `tsconfig.json`**

Add inside `compilerOptions`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**Step 3: Add path aliases to `tsconfig.app.json`**

Add inside `compilerOptions`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**Step 4: Update `vite.config.ts` with resolve alias**

```typescript
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
```

**Step 5: Verify path alias works**

In `src/App.tsx`, add an import using the alias (will be used properly after shadcn init):

```tsx
// This will resolve correctly once we have files in src/lib/
// For now, verify build doesn't break:
```

```bash
pnpm build
```

Expected: Build succeeds with no errors.

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: configure TypeScript path aliases (@/)"
```

---

### Task 4: Initialize shadcn/ui

**Files:**
- Create: `components.json`
- Create: `src/lib/utils.ts`
- Modify: `src/index.css` (CSS variables added)
- Modify: `package.json` (dependencies added by shadcn CLI)

**Step 1: Run shadcn init**

```bash
pnpm dlx shadcn@latest init -d
```

The `-d` flag uses defaults. If prompted, select:
- Style: New York
- Base color: Neutral
- CSS variables: yes

**Step 2: Verify files were created**

Check that these files exist:
- `components.json`
- `src/lib/utils.ts`

```bash
ls components.json src/lib/utils.ts
```

Expected: Both files listed.

**Step 3: Verify build still works**

```bash
pnpm build
```

Expected: Build succeeds.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: initialize shadcn/ui with default config"
```

---

### Task 5: Add Starter Components and Verify

**Files:**
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/card.tsx`
- Modify: `src/App.tsx`

**Step 1: Add Button and Card components**

```bash
pnpm dlx shadcn@latest add button card
```

**Step 2: Verify component files exist**

```bash
ls src/components/ui/button.tsx src/components/ui/card.tsx
```

Expected: Both files listed.

**Step 3: Update `src/App.tsx` with a working layout**

Replace `src/App.tsx` with:

```tsx
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

function App() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-4">
      <h1 className="text-4xl font-bold tracking-tight">Preview Tool</h1>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>
            Your app is set up with Vite + React + Tailwind CSS + shadcn/ui.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button>Get Started</Button>
          <Button variant="outline">Learn More</Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default App
```

**Step 4: Verify build passes**

```bash
pnpm build
```

Expected: Build succeeds with no errors.

**Step 5: Verify dev server renders correctly**

```bash
pnpm dev &
sleep 3
curl -s http://localhost:5173 | head -10
kill %1
```

Expected: HTML page loads without errors.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Button and Card components with welcome layout"
```

---

### Task 6: Clean Up and Final Verification

**Files:**
- Delete: `src/App.css` (if exists, unused with Tailwind)
- Delete: `src/assets/` (default Vite assets, unused)
- Modify: `.gitignore` (ensure docs/plans is tracked)

**Step 1: Remove unused default files**

```bash
rm -f src/App.css
rm -rf src/assets
```

**Step 2: Final build check**

```bash
pnpm build
```

Expected: Build succeeds.

**Step 3: Run TypeScript type check**

```bash
pnpm exec tsc --noEmit
```

Expected: No type errors.

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove unused default Vite scaffolding files"
```

---

## Summary

After completing all 6 tasks you'll have:

- A working Vite + React 19 + TypeScript project
- Tailwind CSS v4 configured via Vite plugin (no PostCSS)
- shadcn/ui initialized with Button and Card components
- Path aliases (`@/`) configured
- A clean `App.tsx` with a working welcome layout
- Ready to add more components via `pnpm dlx shadcn@latest add <component>`
