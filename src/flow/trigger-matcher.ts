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
