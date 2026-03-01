/**
 * Converts a camelCase identifier to a human-readable label.
 * E.g. "appointmentTable" → "Appointment Table"
 */
export function formatLabel(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim()
}
