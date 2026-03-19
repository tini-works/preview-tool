/**
 * Static validation for preview screens.
 * Runs at generation time — no browser needed.
 * Catches missing fields, identical states, translation mismatches.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { EnrichedScreen } from './spec-pipeline-orchestrator.js'
import type { RegionDef } from './spec-to-model.js'

export interface ScreenValidation {
  screenId: string
  status: 'pass' | 'warn' | 'fail'
  issues: ValidationIssue[]
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info'
  message: string
}

/**
 * Validate all enriched screens and return per-screen results.
 */
export function validateScreens(
  enrichedScreens: EnrichedScreen[],
  cwd: string,
  translatableStrings?: Set<string>,
): ScreenValidation[] {
  return enrichedScreens.map((screen) =>
    validateScreen(screen, cwd, translatableStrings)
  )
}

function validateScreen(
  screen: EnrichedScreen,
  cwd: string,
  translatableStrings?: Set<string>,
): ScreenValidation {
  const issues: ValidationIssue[] = []

  const regions = screen.enrichedRegions
  const regionEntries = Object.entries(regions)

  // 1. Check: screen has regions
  if (regionEntries.length === 0) {
    issues.push({ severity: 'warning', message: 'No regions — screen may render with default state only' })
  }

  for (const [regionKey, region] of regionEntries) {
    // 2. Check: region has multiple states
    const stateNames = Object.keys(region.states)
    if (stateNames.length <= 1) {
      issues.push({ severity: 'info', message: `Region "${regionKey}" has only ${stateNames.length} state(s) — no state switching` })
    }

    // 3. Check: states have different values (state switching is meaningful)
    if (stateNames.length > 1) {
      checkStateDifferences(region, regionKey, issues)
    }

    // 4. Check: mockData fields match component code
    if (screen.sourceFile) {
      checkFieldsMatchCode(screen, region, regionKey, cwd, issues)
    }
  }

  // 5. Check: translations match JSX text (if translations exist)
  if (screen.translations && translatableStrings && screen.sourceFile) {
    checkTranslations(screen, cwd, translatableStrings, issues)
  }

  const status = issues.some((i) => i.severity === 'error') ? 'fail'
    : issues.some((i) => i.severity === 'warning') ? 'warn'
    : 'pass'

  return { screenId: screen.id, status, issues }
}

/**
 * Check that at least some fields differ between states.
 * If all states have identical data, state switching has no visible effect.
 */
function checkStateDifferences(
  region: RegionDef,
  regionKey: string,
  issues: ValidationIssue[],
): void {
  const stateNames = Object.keys(region.states)
  const defaultState = region.states[region.defaultState] ?? region.states[stateNames[0]]
  if (!defaultState) return

  let anyDifference = false
  for (const stateName of stateNames) {
    if (stateName === region.defaultState || stateName === stateNames[0]) continue
    const stateData = region.states[stateName]
    if (!stateData) continue

    // Check if any field has a different value
    for (const key of Object.keys(defaultState)) {
      if (JSON.stringify(defaultState[key]) !== JSON.stringify(stateData[key])) {
        anyDifference = true
        break
      }
    }
    if (anyDifference) break
  }

  if (!anyDifference) {
    issues.push({
      severity: 'warning',
      message: `Region "${regionKey}": all states have identical data — state switching will have no visible effect. Add different values per state (e.g., isLoading: true in loading, false in default).`,
    })
  }
}

/**
 * Check that mockData fields are actually used by the component.
 * Reads the source file and checks for field name references.
 */
function checkFieldsMatchCode(
  screen: EnrichedScreen,
  region: RegionDef,
  regionKey: string,
  cwd: string,
  issues: ValidationIssue[],
): void {
  const absPath = resolve(cwd, screen.sourceFile!)
  if (!existsSync(absPath)) return

  let sourceCode: string
  try {
    sourceCode = readFileSync(absPath, 'utf-8')
  } catch {
    return
  }

  // Get all field names from the default state
  const defaultState = region.states[region.defaultState] ?? region.states[Object.keys(region.states)[0]]
  if (!defaultState) return

  // Check each field: is it referenced in the source code?
  for (const field of Object.keys(defaultState)) {
    // Simple heuristic: field name appears in source code
    if (!sourceCode.includes(field)) {
      issues.push({
        severity: 'info',
        message: `Region "${regionKey}": mockData has field "${field}" but it's not found in the component source. May be unused.`,
      })
    }
  }
}

/**
 * Check that translation keys match actual text in the JSX source.
 */
function checkTranslations(
  screen: EnrichedScreen,
  cwd: string,
  translatableStrings: Set<string>,
  issues: ValidationIssue[],
): void {
  const absPath = resolve(cwd, screen.sourceFile!)
  if (!existsSync(absPath)) return

  let sourceCode: string
  try {
    sourceCode = readFileSync(absPath, 'utf-8')
  } catch {
    return
  }

  // Check each translation key: does the source text exist in the component?
  for (const [lang, entries] of Object.entries(screen.translations!)) {
    for (const sourceText of Object.keys(entries as Record<string, unknown>)) {
      if (!sourceCode.includes(sourceText)) {
        issues.push({
          severity: 'warning',
          message: `Translation "${sourceText}" (${lang}) not found in component source. The text may have changed or use HTML entities.`,
        })
      }
    }
  }
}

/**
 * Print validation results to console.
 */
export function printValidationResults(results: ScreenValidation[]): void {
  const passed = results.filter((r) => r.status === 'pass').length
  const warned = results.filter((r) => r.status === 'warn').length
  const failed = results.filter((r) => r.status === 'fail').length

  for (const result of results) {
    if (result.status === 'pass' && result.issues.length === 0) continue

    const icon = result.status === 'pass' ? '✓' : result.status === 'warn' ? '⚠' : '✗'
    console.log(`  ${icon} ${result.screenId}`)
    for (const issue of result.issues) {
      const prefix = issue.severity === 'error' ? '    ✗' : issue.severity === 'warning' ? '    ⚠' : '    ·'
      console.log(`${prefix} ${issue.message}`)
    }
  }

  console.log(`  Validation: ${passed} pass, ${warned} warn, ${failed} fail`)
}
