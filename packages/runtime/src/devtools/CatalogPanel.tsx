import { useMemo } from 'react'
import { FileText, PanelLeftClose, PanelLeft } from 'lucide-react'
import { cn } from '../lib/utils.ts'
import { useDevToolsStore } from '../store/useDevToolsStore.ts'
import { getScreenEntries } from '../ScreenRegistry.ts'
import type { ScreenEntry } from '../types.ts'

interface Section {
  label: string
  screens: ScreenEntry[]
}

function groupBySection(modules: ScreenEntry[]): Section[] {
  const sections = new Map<string, ScreenEntry[]>()

  for (const m of modules) {
    const parts = m.route.replace(/^\//, '').split('/')
    const section = parts.length > 1 ? parts[0] : ''
    const list = sections.get(section) ?? []
    list.push(m)
    sections.set(section, list)
  }

  const result: Section[] = []

  // Sections with multiple screens first (alphabetical)
  for (const [key, screens] of [...sections.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (key && screens.length > 0) {
      result.push({ label: key, screens })
    }
  }

  // Standalone screens (no section prefix)
  const standalone = sections.get('')
  if (standalone && standalone.length > 0) {
    result.push({ label: '', screens: standalone })
  }

  return result
}

export function CatalogPanel() {
  const modules = getScreenEntries()
  const selectedRoute = useDevToolsStore((s) => s.selectedRoute)
  const setSelectedRoute = useDevToolsStore((s) => s.setSelectedRoute)
  const catalogCollapsed = useDevToolsStore((s) => s.catalogCollapsed)
  const toggleCatalogCollapsed = useDevToolsStore(
    (s) => s.toggleCatalogCollapsed
  )

  const sections = useMemo(() => groupBySection(modules), [modules])

  if (catalogCollapsed) {
    return (
      <div data-testid="catalog-panel" className="flex h-full w-10 flex-shrink-0 flex-col border-r border-neutral-200 bg-white">
        <button
          onClick={toggleCatalogCollapsed}
          className="flex h-10 items-center justify-center text-neutral-400 hover:text-neutral-600"
          title="Expand catalog"
        >
          <PanelLeft className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div data-testid="catalog-panel" className="flex h-full w-56 flex-shrink-0 flex-col border-r border-neutral-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
        <span className="text-xs font-semibold tracking-wider text-neutral-400">
          SCREENS
        </span>
        <button
          onClick={toggleCatalogCollapsed}
          className="text-neutral-400 hover:text-neutral-600"
          title="Collapse catalog"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </div>

      {/* Screen list */}
      <div className="flex-1 overflow-y-auto py-1">
        {modules.length === 0 ? (
          <p className="px-3 py-4 text-xs text-neutral-400">
            No content files found.
          </p>
        ) : (
          sections.map((section) => (
            <div key={section.label || '_standalone'}>
              {section.label && (
                <p className="px-3 pb-0.5 pt-3 text-[10px] font-semibold tracking-wider text-neutral-400">
                  {section.label.toUpperCase()}
                </p>
              )}
              {section.screens.map((m) => {
                const parts = m.route.replace(/^\//, '').split('/')
                const screenName = parts[parts.length - 1]

                return (
                  <button
                    key={m.route}
                    onClick={() => setSelectedRoute(m.route)}
                    className={cn(
                      'flex w-full items-center gap-2 py-1.5 text-left text-sm transition-colors',
                      section.label ? 'pl-5 pr-3' : 'px-3',
                      selectedRoute === m.route
                        ? 'bg-neutral-900/5 font-medium text-neutral-900'
                        : 'text-neutral-600 hover:bg-neutral-50'
                    )}
                  >
                    <FileText className="size-3.5 shrink-0" />
                    <span className="truncate">{screenName}</span>
                  </button>
                )
              })}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
