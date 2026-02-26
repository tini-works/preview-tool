import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DeviceType } from '@/preview/device-frames'

export type OsMode = 'light' | 'dark'
export type NetworkMode = 'online' | 'slow-3g' | 'offline'

interface DevToolsState {
  activeDevice: DeviceType
  responsiveWidth: number
  responsiveHeight: number
  osMode: OsMode
  selectedRoute: string | null
  selectedState: string | null
  catalogCollapsed: boolean
  inspectorCollapsed: boolean
  playMode: boolean
  flowHistory: Array<{ route: string; state: string | null }>
  networkMode: NetworkMode
  fontScale: number
  language: string
  listItemCount: number
  featureFlags: Record<string, boolean>
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
  setPlayMode: (enabled: boolean) => void
  togglePlayMode: () => void
  pushFlowHistory: (route: string, state: string | null) => void
  resetFlowHistory: () => void
  navigateFlow: (route: string, state: string | null) => void
  setNetworkMode: (mode: NetworkMode) => void
  setFontScale: (scale: number) => void
  setLanguage: (lang: string) => void
  setListItemCount: (count: number) => void
  setFeatureFlag: (key: string, value: boolean) => void
  resetFeatureFlags: () => void
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
  playMode: false,
  flowHistory: [],
  networkMode: 'online' as NetworkMode,
  fontScale: 1,
  language: 'en',
  listItemCount: 5,
  featureFlags: {},
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
        set((prev) => {
          if (route === prev.selectedRoute) return {}
          return { selectedRoute: route, selectedState: null }
        }),

      setSelectedState: (state) =>
        set({ selectedState: state }),

      setResponsiveSize: (width, height) =>
        set({ responsiveWidth: width, responsiveHeight: height }),

      toggleCatalogCollapsed: () =>
        set((state) => ({ catalogCollapsed: !state.catalogCollapsed })),

      toggleInspectorCollapsed: () =>
        set((state) => ({ inspectorCollapsed: !state.inspectorCollapsed })),

      setPlayMode: (enabled) =>
        set({ playMode: enabled }),

      togglePlayMode: () =>
        set((state) => ({
          playMode: !state.playMode,
          flowHistory: !state.playMode ? [] : state.flowHistory,
        })),

      pushFlowHistory: (route, state) =>
        set((prev) => ({
          flowHistory: [...prev.flowHistory.slice(-49), { route, state }],
        })),

      resetFlowHistory: () =>
        set({ flowHistory: [] }),

      navigateFlow: (route, state) =>
        set({ selectedRoute: route, selectedState: state }),

      setNetworkMode: (mode) =>
        set({ networkMode: mode }),

      setFontScale: (scale) =>
        set({ fontScale: Math.round(Math.max(0.75, Math.min(2, scale)) * 100) / 100 }),

      setLanguage: (lang) =>
        set({ language: lang }),

      setListItemCount: (count) =>
        set({ listItemCount: Math.max(0, Math.min(99, Math.round(count))) }),

      setFeatureFlag: (key, value) =>
        set((prev) => ({
          featureFlags: { ...prev.featureFlags, [key]: value },
        })),

      resetFeatureFlags: () =>
        set({ featureFlags: {} }),
    }),
    {
      name: 'preview-tool-devtools',
      partialize: (state) => ({
        activeDevice: state.activeDevice,
        responsiveWidth: state.responsiveWidth,
        responsiveHeight: state.responsiveHeight,
        osMode: state.osMode,
        fontScale: state.fontScale,
        language: state.language,
        networkMode: state.networkMode,
      }),
    }
  )
)
