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
  catalogCollapsed: boolean
  inspectorCollapsed: boolean
  playMode: boolean
  flowHistory: Array<{ route: string }>
  networkMode: NetworkMode
  fontScale: number
  language: string
  featureFlags: Record<string, boolean>
  regionStates: Record<string, string>
  regionListCounts: Record<string, number>
}

interface DevToolsActions {
  setActiveDevice: (device: DeviceType) => void
  setOsMode: (mode: OsMode) => void
  toggleOsMode: () => void
  setSelectedRoute: (route: string | null) => void
  setResponsiveSize: (width: number, height: number) => void
  toggleCatalogCollapsed: () => void
  toggleInspectorCollapsed: () => void
  setPlayMode: (enabled: boolean) => void
  togglePlayMode: () => void
  pushFlowHistory: (route: string) => void
  resetFlowHistory: () => void
  navigateFlow: (route: string) => void
  setNetworkMode: (mode: NetworkMode) => void
  setFontScale: (scale: number) => void
  setLanguage: (lang: string) => void
  setFeatureFlag: (key: string, value: boolean) => void
  resetFeatureFlags: () => void
  setRegionState: (regionKey: string, state: string) => void
  setRegionListCount: (regionKey: string, count: number) => void
  resetRegions: () => void
}

export type DevToolsStore = DevToolsState & DevToolsActions

const DEFAULT_STATE: DevToolsState = {
  activeDevice: 'iphone-15-pro',
  responsiveWidth: 390,
  responsiveHeight: 844,
  osMode: 'light',
  selectedRoute: null,
  catalogCollapsed: false,
  inspectorCollapsed: false,
  playMode: false,
  flowHistory: [],
  networkMode: 'online' as NetworkMode,
  fontScale: 1,
  language: 'en',
  featureFlags: {},
  regionStates: {},
  regionListCounts: {},
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
          return {
            selectedRoute: route,
            regionStates: {},
            regionListCounts: {},
          }
        }),

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

      pushFlowHistory: (route) =>
        set((prev) => ({
          flowHistory: [...prev.flowHistory.slice(-49), { route }],
        })),

      resetFlowHistory: () =>
        set({ flowHistory: [] }),

      navigateFlow: (route) =>
        set({ selectedRoute: route, regionStates: {}, regionListCounts: {} }),

      setNetworkMode: (mode) =>
        set({ networkMode: mode }),

      setFontScale: (scale) =>
        set({ fontScale: Math.round(Math.max(0.75, Math.min(2, scale)) * 100) / 100 }),

      setLanguage: (lang) =>
        set({ language: lang }),

      setFeatureFlag: (key, value) =>
        set((prev) => ({
          featureFlags: { ...prev.featureFlags, [key]: value },
        })),

      resetFeatureFlags: () =>
        set({ featureFlags: {} }),

      setRegionState: (regionKey, state) =>
        set((prev) => ({
          regionStates: { ...prev.regionStates, [regionKey]: state },
        })),

      setRegionListCount: (regionKey, count) =>
        set((prev) => ({
          regionListCounts: {
            ...prev.regionListCounts,
            [regionKey]: Math.max(0, Math.min(99, Math.round(count))),
          },
        })),

      resetRegions: () =>
        set({ regionStates: {}, regionListCounts: {} }),
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
      }),
    }
  )
)
