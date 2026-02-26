export type DeviceType =
  | 'iphone-15-pro'
  | 'iphone-se'
  | 'pixel-8'
  | 'ipad-mini'
  | 'desktop'
  | 'responsive'

export type FrameCategory = 'mobile' | 'browser' | 'responsive'

export interface DeviceDefinition {
  readonly id: DeviceType
  readonly name: string
  readonly width: number
  readonly height: number
  readonly category: FrameCategory
  readonly notch: 'dynamic-island' | 'none'
  readonly homeIndicator: boolean
  readonly statusBarHeight: number
}

export const DEVICE_DEFINITIONS: ReadonlyMap<DeviceType, DeviceDefinition> = new Map([
  ['iphone-15-pro', {
    id: 'iphone-15-pro',
    name: 'iPhone 15 Pro',
    width: 393,
    height: 852,
    category: 'mobile',
    notch: 'dynamic-island',
    homeIndicator: true,
    statusBarHeight: 54,
  }],
  ['iphone-se', {
    id: 'iphone-se',
    name: 'iPhone SE',
    width: 375,
    height: 667,
    category: 'mobile',
    notch: 'none',
    homeIndicator: false,
    statusBarHeight: 20,
  }],
  ['pixel-8', {
    id: 'pixel-8',
    name: 'Pixel 8',
    width: 412,
    height: 915,
    category: 'mobile',
    notch: 'none',
    homeIndicator: true,
    statusBarHeight: 24,
  }],
  ['ipad-mini', {
    id: 'ipad-mini',
    name: 'iPad Mini',
    width: 744,
    height: 1133,
    category: 'mobile',
    notch: 'none',
    homeIndicator: true,
    statusBarHeight: 24,
  }],
  ['desktop', {
    id: 'desktop',
    name: 'Desktop',
    width: 1280,
    height: 800,
    category: 'browser',
    notch: 'none',
    homeIndicator: false,
    statusBarHeight: 0,
  }],
  ['responsive', {
    id: 'responsive',
    name: 'Responsive',
    width: 390,
    height: 844,
    category: 'responsive',
    notch: 'none',
    homeIndicator: false,
    statusBarHeight: 0,
  }],
])

export function getDevice(id: DeviceType): DeviceDefinition {
  const device = DEVICE_DEFINITIONS.get(id)
  if (!device) {
    throw new Error(`Unknown device: ${id}`)
  }
  return device
}

export function getAllDevices(): readonly DeviceDefinition[] {
  return [...DEVICE_DEFINITIONS.values()]
}
