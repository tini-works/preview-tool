import { describe, it, expect } from 'vitest'
import { computeRegionData, assembleRegionData, resolveFlags } from '../ScreenRenderer'

describe('computeRegionData', () => {
  const regions = {
    'profile': {
      label: 'Profile',
      states: {
        loaded: { name: 'John', email: 'john@test.com' },
        loading: { name: null, email: null },
        error: { name: null, email: null, errorMessage: 'Failed to load' },
      },
      defaultState: 'loaded',
    },
  }

  it('returns default state data when no overrides', () => {
    const result = computeRegionData(regions, {}, {})
    expect(result['profile'].activeState).toBe('loaded')
    expect(result['profile'].stateData).toEqual({ name: 'John', email: 'john@test.com' })
  })

  it('returns selected state data when regionStates override', () => {
    const result = computeRegionData(regions, { profile: 'loading' }, {})
    expect(result['profile'].activeState).toBe('loading')
    expect(result['profile'].stateData).toEqual({ name: null, email: null })
  })

  it('falls back to defaultState for unknown state name', () => {
    const result = computeRegionData(regions, { profile: 'nonexistent' }, {})
    expect(result['profile'].activeState).toBe('nonexistent')
    // Falls back to default state data
    expect(result['profile'].stateData).toEqual({ name: 'John', email: 'john@test.com' })
  })

  it('applies translations for non-English language', () => {
    const regionsWithTranslations = {
      'profile': {
        ...regions['profile'],
        translations: {
          de: { name: 'Johann', email: 'johann@test.de' },
          fr: { name: 'Jean' },
        },
      },
    }
    const result = computeRegionData(regionsWithTranslations, {}, {}, 'de')
    expect(result['profile'].stateData).toEqual({ name: 'Johann', email: 'johann@test.de' })
  })

  it('partially overlays translations (only provided fields)', () => {
    const regionsWithTranslations = {
      'profile': {
        ...regions['profile'],
        translations: {
          fr: { name: 'Jean' },  // only name, not email
        },
      },
    }
    const result = computeRegionData(regionsWithTranslations, {}, {}, 'fr')
    expect(result['profile'].stateData).toEqual({ name: 'Jean', email: 'john@test.com' })
  })

  it('does not apply translations for English', () => {
    const regionsWithTranslations = {
      'profile': {
        ...regions['profile'],
        translations: {
          de: { name: 'Johann' },
        },
      },
    }
    const result = computeRegionData(regionsWithTranslations, {}, {}, 'en')
    expect(result['profile'].stateData).toEqual({ name: 'John', email: 'john@test.com' })
  })

  it('does not apply translations when language has no translations', () => {
    const regionsWithTranslations = {
      'profile': {
        ...regions['profile'],
        translations: {
          de: { name: 'Johann' },
        },
      },
    }
    const result = computeRegionData(regionsWithTranslations, {}, {}, 'ja')
    expect(result['profile'].stateData).toEqual({ name: 'John', email: 'john@test.com' })
  })

  it('handles list regions with count override', () => {
    const listRegions = {
      'songs': {
        label: 'Songs',
        states: {
          loaded: { songs: [{ id: 1 }, { id: 2 }, { id: 3 }] },
        },
        defaultState: 'loaded',
        isList: true,
        mockItems: [{ id: 1 }, { id: 2 }, { id: 3 }],
        defaultCount: 3,
      },
    }
    const result = computeRegionData(listRegions, {}, { songs: 1 })
    expect((result['songs'].stateData as Record<string, unknown>).songs).toHaveLength(1)
  })

  it('handles empty regions', () => {
    const result = computeRegionData({}, {}, {})
    expect(result).toEqual({})
  })

  it('handles multiple regions', () => {
    const multiRegions = {
      'header': {
        label: 'Header',
        states: { loaded: { title: 'Dashboard' } },
        defaultState: 'loaded',
      },
      'content': {
        label: 'Content',
        states: { loaded: { items: [1, 2, 3] }, loading: { items: [] } },
        defaultState: 'loaded',
      },
    }
    const result = computeRegionData(multiRegions, { content: 'loading' }, {})
    expect(result['header'].stateData).toEqual({ title: 'Dashboard' })
    expect(result['content'].stateData).toEqual({ items: [] })
  })
})

describe('assembleRegionData', () => {
  it('merges all region state data into a flat object', () => {
    const regions = {
      'header': {
        label: 'Header',
        states: { loaded: { title: 'Dashboard' } },
        defaultState: 'loaded',
      },
      'content': {
        label: 'Content',
        states: { loaded: { items: [1, 2, 3] } },
        defaultState: 'loaded',
      },
    }
    const result = assembleRegionData(regions, {}, {})
    expect(result).toEqual({ title: 'Dashboard', items: [1, 2, 3] })
  })

  it('applies translations for non-English language', () => {
    const regions = {
      'header': {
        label: 'Header',
        states: { loaded: { title: 'Dashboard' } },
        defaultState: 'loaded',
        translations: {
          de: { title: 'Übersicht' },
        },
      },
    }
    const result = assembleRegionData(regions, {}, {}, 'de')
    expect(result).toEqual({ title: 'Übersicht' })
  })
})

describe('resolveFlags', () => {
  it('returns defaults when no overrides', () => {
    const flags = {
      darkMode: { label: 'Dark Mode', default: false },
      betaFeature: { label: 'Beta', default: true },
    }
    const result = resolveFlags(flags, {})
    expect(result).toEqual({ darkMode: false, betaFeature: true })
  })

  it('applies overrides', () => {
    const flags = {
      darkMode: { label: 'Dark Mode', default: false },
    }
    const result = resolveFlags(flags, { darkMode: true })
    expect(result).toEqual({ darkMode: true })
  })

  it('returns empty for undefined definitions', () => {
    const result = resolveFlags(undefined, {})
    expect(result).toEqual({})
  })
})
