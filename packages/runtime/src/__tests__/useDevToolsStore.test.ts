import { describe, it, expect, beforeEach } from 'vitest'
import { useDevToolsStore } from '../store/useDevToolsStore.ts'

describe('useDevToolsStore', () => {
  beforeEach(() => {
    // Reset store to defaults
    useDevToolsStore.setState({
      activeDevice: 'iphone-15-pro',
      responsiveWidth: 390,
      responsiveHeight: 844,
      osMode: 'light',
      selectedRoute: null,
      catalogCollapsed: false,
      inspectorCollapsed: false,
      flowHistory: [],
      networkMode: 'online',
      fontScale: 1,
      language: 'en',
      featureFlags: {},
      regionStates: {},
      regionListCounts: {},
    })
  })

  describe('fontScale', () => {
    it('sets font scale', () => {
      useDevToolsStore.getState().setFontScale(1.5)
      expect(useDevToolsStore.getState().fontScale).toBe(1.5)
    })

    it('clamps font scale to min 0.75', () => {
      useDevToolsStore.getState().setFontScale(0.5)
      expect(useDevToolsStore.getState().fontScale).toBe(0.75)
    })

    it('clamps font scale to max 2', () => {
      useDevToolsStore.getState().setFontScale(3)
      expect(useDevToolsStore.getState().fontScale).toBe(2)
    })

    it('rounds to 2 decimal places', () => {
      useDevToolsStore.getState().setFontScale(1.333)
      expect(useDevToolsStore.getState().fontScale).toBe(1.33)
    })
  })

  describe('language', () => {
    it('defaults to en', () => {
      expect(useDevToolsStore.getState().language).toBe('en')
    })

    it('sets language', () => {
      useDevToolsStore.getState().setLanguage('de')
      expect(useDevToolsStore.getState().language).toBe('de')
    })
  })

  describe('networkMode', () => {
    it('defaults to online', () => {
      expect(useDevToolsStore.getState().networkMode).toBe('online')
    })

    it('sets network mode', () => {
      useDevToolsStore.getState().setNetworkMode('offline')
      expect(useDevToolsStore.getState().networkMode).toBe('offline')
    })

    it('sets slow-3g mode', () => {
      useDevToolsStore.getState().setNetworkMode('slow-3g')
      expect(useDevToolsStore.getState().networkMode).toBe('slow-3g')
    })
  })

  describe('regionStates', () => {
    it('sets region state', () => {
      useDevToolsStore.getState().setRegionState('profile', 'loading')
      expect(useDevToolsStore.getState().regionStates).toEqual({ profile: 'loading' })
    })

    it('sets multiple region states independently', () => {
      useDevToolsStore.getState().setRegionState('profile', 'loading')
      useDevToolsStore.getState().setRegionState('songs', 'error')
      expect(useDevToolsStore.getState().regionStates).toEqual({
        profile: 'loading',
        songs: 'error',
      })
    })

    it('resets region states', () => {
      useDevToolsStore.getState().setRegionState('profile', 'loading')
      useDevToolsStore.getState().resetRegions()
      expect(useDevToolsStore.getState().regionStates).toEqual({})
    })
  })

  describe('regionListCounts', () => {
    it('sets list count', () => {
      useDevToolsStore.getState().setRegionListCount('songs', 5)
      expect(useDevToolsStore.getState().regionListCounts).toEqual({ songs: 5 })
    })

    it('clamps to min 0', () => {
      useDevToolsStore.getState().setRegionListCount('songs', -3)
      expect(useDevToolsStore.getState().regionListCounts).toEqual({ songs: 0 })
    })

    it('clamps to max 99', () => {
      useDevToolsStore.getState().setRegionListCount('songs', 200)
      expect(useDevToolsStore.getState().regionListCounts).toEqual({ songs: 99 })
    })
  })

  describe('selectedRoute', () => {
    it('resets regionStates and regionListCounts when route changes', () => {
      useDevToolsStore.getState().setRegionState('profile', 'loading')
      useDevToolsStore.getState().setRegionListCount('songs', 5)
      useDevToolsStore.getState().setSelectedRoute('/new-screen')
      expect(useDevToolsStore.getState().regionStates).toEqual({})
      expect(useDevToolsStore.getState().regionListCounts).toEqual({})
    })

    it('does not reset when selecting same route', () => {
      useDevToolsStore.getState().setSelectedRoute('/screen-a')
      useDevToolsStore.getState().setRegionState('profile', 'loading')
      useDevToolsStore.getState().setSelectedRoute('/screen-a')
      expect(useDevToolsStore.getState().regionStates).toEqual({ profile: 'loading' })
    })
  })

  describe('osMode', () => {
    it('toggles between light and dark', () => {
      expect(useDevToolsStore.getState().osMode).toBe('light')
      useDevToolsStore.getState().toggleOsMode()
      expect(useDevToolsStore.getState().osMode).toBe('dark')
      useDevToolsStore.getState().toggleOsMode()
      expect(useDevToolsStore.getState().osMode).toBe('light')
    })
  })

  describe('featureFlags', () => {
    it('sets a flag', () => {
      useDevToolsStore.getState().setFeatureFlag('darkMode', true)
      expect(useDevToolsStore.getState().featureFlags).toEqual({ darkMode: true })
    })

    it('resets flags', () => {
      useDevToolsStore.getState().setFeatureFlag('darkMode', true)
      useDevToolsStore.getState().resetFeatureFlags()
      expect(useDevToolsStore.getState().featureFlags).toEqual({})
    })
  })

  describe('flowHistory', () => {
    it('pushes to flow history', () => {
      useDevToolsStore.getState().pushFlowHistory('/screen-a')
      useDevToolsStore.getState().pushFlowHistory('/screen-b')
      expect(useDevToolsStore.getState().flowHistory).toEqual([
        { route: '/screen-a' },
        { route: '/screen-b' },
      ])
    })

    it('caps at 50 entries', () => {
      for (let i = 0; i < 60; i++) {
        useDevToolsStore.getState().pushFlowHistory(`/screen-${i}`)
      }
      expect(useDevToolsStore.getState().flowHistory).toHaveLength(50)
    })

    it('resets flow history', () => {
      useDevToolsStore.getState().pushFlowHistory('/screen-a')
      useDevToolsStore.getState().resetFlowHistory()
      expect(useDevToolsStore.getState().flowHistory).toEqual([])
    })
  })
})
