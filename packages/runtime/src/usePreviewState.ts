import { useState, useContext } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { RegionDataContext } from './RegionDataContext.tsx'

export function camelToKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

export function usePreviewState<T>(
  name: string,
  initialValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState(initialValue)
  const ctx = useContext(RegionDataContext)

  const regionKey = camelToKebab(name)
  const regionEntry = ctx?.regionData?.[regionKey]

  if (regionEntry?.stateData && name in regionEntry.stateData) {
    return [regionEntry.stateData[name] as T, setState]
  }

  return [state, setState]
}
