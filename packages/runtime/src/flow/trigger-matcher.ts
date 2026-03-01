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
 */
export function matchComponentTrigger(
  target: EventTarget | null,
  boundary: HTMLElement,
  triggers: ComponentTrigger[]
): ComponentTrigger | null {
  if (triggers.length === 0) return null

  for (const trigger of triggers) {
    let el = target instanceof HTMLElement ? target : null

    while (el && el !== boundary) {
      if (el.matches(trigger.selector)) {
        if (trigger.text) {
          const text = el.textContent?.trim()
          if (text && text.includes(trigger.text)) return trigger
        } else if (trigger.ariaLabel) {
          const label = el.getAttribute('aria-label')
          if (label === trigger.ariaLabel) return trigger
        } else {
          return trigger
        }
      }
      el = el.parentElement
    }
  }

  return null
}
