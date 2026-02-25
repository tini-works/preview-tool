import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DeviceType } from '@/preview/device-frames'

export type OsMode = 'light' | 'dark'

interface DevToolsState {
  activeDevice: DeviceType
  responsiveWidth: number
  responsiveHeight: number
  osMode: OsMode
  selectedRoute: string | null
  selectedState: string | null
  catalogCollapsed: boolean
  inspectorCollapsed: boolean
}

interface DevToolsActions {
  setActiveDevice: (device: DeviceType) => void
  setOsMode: (mode: OsMode) => void
  toggleOsMode: () => void
  setSelectedRoute: (route: string | null) => void
  setSelectedState: (state: string | null) => void
  setResponsiveSize: (width: number, height: number) => void
  toggleCatalogCollapsed: () => void
  toggleInspectorCollapsed: () => void
}

export type DevToolsStore = DevToolsState & DevToolsActions

const DEFAULT_STATE: DevToolsState = {
  activeDevice: 'iphone-15-pro',
  responsiveWidth: 390,
  responsiveHeight: 844,
  osMode: 'light',
  selectedRoute: null,
  selectedState: null,
  catalogCollapsed: false,
  inspectorCollapsed: false,
}

export const useDevToolsStore = create<DevToolsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,

      setActiveDevice: (device) =>
        set({ activeDevice: device }),

      setOsMode: (mode) =>
        set({ osMode: mode }),

      toggleOsMode: () =>
        set((state) => ({
          osMode: state.osMode === 'light' ? 'dark' : 'light',
        })),

      setSelectedRoute: (route) =>
        set({ selectedRoute: route, selectedState: null }),

      setSelectedState: (state) =>
        set({ selectedState: state }),

      setResponsiveSize: (width, height) =>
        set({ responsiveWidth: width, responsiveHeight: height }),

      toggleCatalogCollapsed: () =>
        set((state) => ({ catalogCollapsed: !state.catalogCollapsed })),

      toggleInspectorCollapsed: () =>
        set((state) => ({ inspectorCollapsed: !state.inspectorCollapsed })),
    }),
    {
      name: 'preview-tool-devtools',
      partialize: (state) => ({
        activeDevice: state.activeDevice,
        responsiveWidth: state.responsiveWidth,
        responsiveHeight: state.responsiveHeight,
        osMode: state.osMode,
      }),
    }
  )
)
