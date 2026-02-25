import { cn } from '@/lib/utils'
import type { OsMode } from '@/devtools/useDevToolsStore'

interface HomeIndicatorProps {
  osMode: OsMode
}

export function HomeIndicator({ osMode }: HomeIndicatorProps) {
  const isDark = osMode === 'dark'

  return (
    <div className="flex shrink-0 items-center justify-center pb-2 pt-1">
      <div
        className={cn(
          'h-[5px] w-[134px] rounded-full',
          isDark ? 'bg-white/60' : 'bg-black/30'
        )}
      />
    </div>
  )
}
