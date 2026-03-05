/**
 * Converts a camelCase, kebab-case, or snake_case identifier to a human-readable label.
 * E.g. "appointmentTable" → "Appointment Table"
 *      "service-grid" → "Service Grid"
 *      "time_slots" → "Time Slots"
 */
export function formatLabel(name: string): string {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (s) => s.toUpperCase())
}
