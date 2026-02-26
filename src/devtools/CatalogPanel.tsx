import { FileText, PanelLeftClose, PanelLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useScreenModules } from '@/screens/useScreenModules'
import { useDevToolsStore } from '@/devtools/useDevToolsStore'

export function CatalogPanel() {
  const modules = useScreenModules()
  const selectedRoute = useDevToolsStore((s) => s.selectedRoute)
  const setSelectedRoute = useDevToolsStore((s) => s.setSelectedRoute)
  const catalogCollapsed = useDevToolsStore((s) => s.catalogCollapsed)
  const toggleCatalogCollapsed = useDevToolsStore(
    (s) => s.toggleCatalogCollapsed
  )

  if (catalogCollapsed) {
    return (
      <div className="flex h-full w-10 flex-shrink-0 flex-col border-r border-neutral-200 bg-white">
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
    <div className="flex h-full w-56 flex-shrink-0 flex-col border-r border-neutral-200 bg-white">
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
          modules.map((m) => (
            <button
              key={m.route}
              onClick={() => setSelectedRoute(m.route)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
                selectedRoute === m.route
                  ? 'bg-neutral-900/5 font-medium text-neutral-900'
                  : 'text-neutral-600 hover:bg-neutral-50'
              )}
            >
              <FileText className="size-3.5 shrink-0" />
              <span className="truncate">{m.route}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
