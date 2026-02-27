import type { ScreenEntry } from './types.ts'

let screenRegistry: ScreenEntry[] = []

export function registerScreens(entries: ScreenEntry[]): void {
  screenRegistry = [...entries]
}

export function getScreenEntries(): ScreenEntry[] {
  return screenRegistry
}

export function getScreenEntry(route: string): ScreenEntry | undefined {
  return screenRegistry.find(e => e.route === route)
}
