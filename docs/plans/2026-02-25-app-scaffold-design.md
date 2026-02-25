# Preview Tool — App Scaffold Design

**Date:** 2026-02-25
**Status:** Approved

## Goal

Initialize the preview-tool project with a modern React stack: Vite + React + TypeScript + Tailwind CSS v4 + shadcn/ui.

## Tech Stack

- **Vite** — build tool & dev server
- **React 19** + **TypeScript**
- **Tailwind CSS v4** — utility-first styling
- **shadcn/ui** — component library (New York style, neutral theme)
- **pnpm** — package manager

## Project Structure

```
preview-tool/
├── src/
│   ├── components/
│   │   └── ui/           ← shadcn/ui components (added via CLI)
│   ├── lib/
│   │   └── utils.ts      ← cn() utility
│   ├── App.tsx            ← root component with basic layout
│   ├── main.tsx           ← entry point
│   └── index.css          ← Tailwind imports + CSS variables
├── components.json        ← shadcn/ui config
├── tsconfig.json
├── vite.config.ts         ← with path aliases (@/)
├── package.json
└── .gitignore
```

## Setup Steps

1. Scaffold Vite React-TS app in current directory
2. Install & configure Tailwind CSS v4
3. Initialize shadcn/ui (components.json, cn() utility, CSS variables)
4. Add starter shadcn components (Button, Card) to verify setup
5. Create minimal App.tsx with working layout

## Outcome

A working dev server (`pnpm dev`) with Tailwind CSS styling and shadcn/ui components ready to use. Additional components can be added via `pnpm dlx shadcn@latest add <component>`.
