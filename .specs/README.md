---
id: proj-1
type: project
title: preview-tool
status: active
---

# preview-tool

## Overview

A CLI tool that analyzes external React applications, discovers their screens/pages, analyzes hooks and data dependencies, and generates isolated preview wrappers with mock data — so screens can be rendered in a device-frame preview environment without running the full app.

Monorepo with two packages:
- `packages/cli/` — CLI tool (`@preview-tool/cli`): AST analysis, code generation
- `packages/runtime/` — Runtime library (`@preview-tool/runtime`): React preview shell, device frames

## Features

- Screen discovery and analysis (AST-based)
- Hook and data dependency analysis
- Mock data generation for isolated rendering
- Preview wrapper code generation (MVC pattern)
- Device-frame preview shell (iPhone, Pixel, iPad, Desktop)
- Flow engine for screen-to-screen navigation
- Dev server with hot reload (Vite)

## Conventions

- TypeScript strict mode
- pnpm workspace monorepo
- ts-morph for AST analysis
- Zod for schema validation
- Tests co-located as `__tests__/*.test.ts`
- Immutable data patterns
