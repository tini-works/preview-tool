import type { ComponentTrigger } from '../types.ts'

/**
 * Walks up from a click target to find the nearest data-flow-target attribute.
 * Returns the trigger string (e.g. "RadioCard:Acute") or null if none found.
 */
export function resolveTrigger(
  target: EventTarget | null,
  boundary: HTMLElement
): string | null {
  let el = target instanceof HTMLElement ? target : null

  while (el && el !== boundary) {
    const trigger = el.dataset.flowTarget
    if (trigger) return trigger
    el = el.parentElement
  }

  return null
}

/**
 * DOM-based trigger matching for CLI-generated screens.
 * Matches clicks against ComponentTrigger definitions using CSS selectors
 * and text content — no data attributes required in production code.
 *
 * Supports `nth` field for disambiguating multiple matches of the same selector.
 * For example, `{ selector: "button", text: "Save", nth: 1 }` matches the 2nd
 * button containing "Save" (0-indexed).
 */
export function matchComponentTrigger(
  target: EventTarget | null,
  boundary: HTMLElement,
  triggers: ComponentTrigger[]
): ComponentTrigger | null {
  if (triggers.length === 0) return null

  for (const trigger of triggers) {
    // When nth is specified, find all matching elements and check if target is the nth one
    if (trigger.nth != null) {
      const matches = findAllMatching(boundary, trigger)
      const nthMatch = matches[trigger.nth]
      if (nthMatch && isOrContains(nthMatch, target)) return trigger
      continue
    }

    let el = target instanceof HTMLElement ? target : null

    while (el && el !== boundary) {
      if (el.matches(trigger.selector)) {
        if (trigger.text) {
          const text = el.textContent?.trim()
          if (text && text.toLowerCase().includes(trigger.text.toLowerCase())) return trigger
        } else if (trigger.ariaLabel) {
          const label = el.getAttribute('aria-label')
          if (label?.trim().toLowerCase() === trigger.ariaLabel?.trim().toLowerCase()) return trigger
        } else {
          return trigger
        }
      }
      el = el.parentElement
    }
  }

  return null
}

function findAllMatching(
  boundary: HTMLElement,
  trigger: ComponentTrigger
): HTMLElement[] {
  const candidates = Array.from(boundary.querySelectorAll<HTMLElement>(trigger.selector))

  return candidates.filter((el) => {
    if (trigger.text) {
      const text = el.textContent?.trim()
      return text != null && text.toLowerCase().includes(trigger.text.toLowerCase())
    }
    if (trigger.ariaLabel) {
      const label = el.getAttribute('aria-label')
      return label?.trim().toLowerCase() === trigger.ariaLabel.trim().toLowerCase()
    }
    return true
  })
}

function isOrContains(parent: HTMLElement, target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return parent === target || parent.contains(target)
}
