export function buildDiscoveryPrompt(fileTree: string[]): string {
  const tree = fileTree.map((f) => `  ${f}`).join('\n')

  return `You are analyzing a React application to identify its screen/page components.

Here is the file tree (only .tsx/.ts/.jsx files):

${tree}

For each file that is a **screen or page component** (a top-level view that represents a distinct route or screen in the app), return a JSON object with:

- "filePath": the exact file path as shown above
- "route": the URL path this screen maps to (e.g., "/booking", "/login", "/")
- "screenName": a human-readable label (e.g., "Booking Page", "Login")

Do NOT include:
- Shared/reusable components (Button, Header, Card, Modal, etc.)
- Utility files, hooks, helpers, or libraries
- Layout components, route configs, or navigation shells
- Entry points (App.tsx, main.tsx, index.tsx at root)
- Type definition files (.d.ts)
- Test files

Return JSON in this exact format:
{
  "screens": [
    { "filePath": "...", "route": "...", "screenName": "..." }
  ]
}

Return ONLY valid JSON, no markdown fences, no explanation.`
}
