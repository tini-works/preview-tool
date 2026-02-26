import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { DeviceDefinition } from '@/preview/device-frames'
import type { OsMode } from '@/devtools/useDevToolsStore'
import { MobileFrame } from '@/preview/MobileFrame'
import { BrowserFrame } from '@/preview/BrowserFrame'
import { ResizableFrame } from '@/preview/ResizableFrame'

interface DeviceFrameProps {
  device: DeviceDefinition
  osMode: OsMode
  responsiveWidth: number
  responsiveHeight: number
  onResponsiveResize: (width: number, height: number) => void
  children: ReactNode
}

export function DeviceFrame({
  device,
  osMode,
  responsiveWidth,
  responsiveHeight,
  onResponsiveResize,
  children,
}: DeviceFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  const frameWidth =
    device.category === 'responsive' ? responsiveWidth : device.width
  const frameHeight =
    device.category === 'responsive' ? responsiveHeight : device.height

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(([entry]) => {
      const { width: cw, height: ch } = entry.contentRect
      // Leave padding around the frame (40px each side)
      const availableW = cw - 80
      const availableH = ch - 80
      const nextScale = Math.min(
        1,
        availableW / frameWidth,
        availableH / frameHeight
      )
      setScale(Math.max(0.1, nextScale))
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [frameWidth, frameHeight])

  function renderFrame() {
    switch (device.category) {
      case 'mobile':
        return (
          <MobileFrame device={device} osMode={osMode}>
            {children}
          </MobileFrame>
        )
      case 'browser':
        return (
          <BrowserFrame device={device} osMode={osMode}>
            {children}
          </BrowserFrame>
        )
      case 'responsive':
        return (
          <ResizableFrame
            width={responsiveWidth}
            height={responsiveHeight}
            osMode={osMode}
            onResize={onResponsiveResize}
          >
            {children}
          </ResizableFrame>
        )
    }
  }

  return (
    <div
      ref={containerRef}
      data-testid="device-frame"
      className="flex flex-1 items-center justify-center overflow-hidden"
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        {renderFrame()}
      </div>
    </div>
  )
}
