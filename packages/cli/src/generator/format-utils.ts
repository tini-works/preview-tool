/**
 * Formats a value as indented JSON for code generation.
 */
export function formatValue(value: unknown, indent: number): string {
  const json = JSON.stringify(value, null, 2)
  const padding = ' '.repeat(indent)
  return json
    .split('\n')
    .map((line, i) => (i === 0 ? line : padding + line))
    .join('\n')
}
