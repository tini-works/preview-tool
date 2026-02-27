import { type ReactNode, useCallback, useRef, useState } from 'react'
import { cn } from '../lib/utils.ts'
import type { OsMode } from '../store/useDevToolsStore.ts'

interface ResizableFrameProps {
  width: number
  height: number
  osMode: OsMode
  onResize: (width: number, height: number) => void
  children: ReactNode
}

type ResizeEdge = 'right' | 'bottom' | 'corner'

export function ResizableFrame({
  width,
  height,
  osMode,
  onResize,
  children,
}: ResizableFrameProps) {
  const isDark = osMode === 'dark'
  const dragRef = useRef<{
    edge: ResizeEdge
    startX: number
    startY: number
    startW: number
    startH: number
  } | null>(null)

  const [dragging, setDragging] = useState(false)

  const handlePointerDown = useCallback(
    (edge: ResizeEdge) => (e: React.PointerEvent) => {
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      dragRef.current = {
        edge,
        startX: e.clientX,
        startY: e.clientY,
        startW: width,
        startH: height,
      }
      setDragging(true)
    },
    [width, height]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return

      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY

      const nextW =
        drag.edge === 'right' || drag.edge === 'corner'
          ? Math.max(200, drag.startW + dx)
          : drag.startW

      const nextH =
        drag.edge === 'bottom' || drag.edge === 'corner'
          ? Math.max(200, drag.startH + dy)
          : drag.startH

      onResize(Math.round(nextW), Math.round(nextH))
    },
    [onResize]
  )

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
    setDragging(false)
  }, [])

  return (
    <div
      className="relative"
      style={{ width, height }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Viewport */}
      <div
        className={cn(
          'h-full w-full overflow-y-auto rounded-md border',
          isDark
            ? 'border-neutral-700 bg-neutral-900'
            : 'border-neutral-300 bg-white'
        )}
        data-theme={osMode}
      >
        {children}
      </div>

      {/* Right edge handle */}
      <div
        className="absolute -right-2 top-0 h-full w-4 cursor-ew-resize"
        onPointerDown={handlePointerDown('right')}
      >
        <div
          className={cn(
            'absolute right-1.5 top-1/2 h-8 w-1 -translate-y-1/2 rounded-full',
            dragging ? 'bg-blue-500' : 'bg-neutral-400'
          )}
        />
      </div>

      {/* Bottom edge handle */}
      <div
        className="absolute -bottom-2 left-0 h-4 w-full cursor-ns-resize"
        onPointerDown={handlePointerDown('bottom')}
      >
        <div
          className={cn(
            'absolute bottom-1.5 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full',
            dragging ? 'bg-blue-500' : 'bg-neutral-400'
          )}
        />
      </div>

      {/* Corner handle */}
      <div
        className="absolute -bottom-2 -right-2 size-4 cursor-nwse-resize"
        onPointerDown={handlePointerDown('corner')}
      >
        <div
          className={cn(
            'absolute bottom-1 right-1 size-2 rounded-sm',
            dragging ? 'bg-blue-500' : 'bg-neutral-400'
          )}
        />
      </div>

      {/* Dimension label */}
      <div
        className={cn(
          'absolute -bottom-7 left-1/2 -translate-x-1/2 rounded-md px-2 py-0.5 text-xs font-mono',
          isDark
            ? 'bg-neutral-800 text-neutral-400'
            : 'bg-neutral-100 text-neutral-500'
        )}
      >
        {width} x {height}
      </div>
    </div>
  )
}
