import { describe, it, expect } from 'vitest'
import { classifyHook } from '../hook-classifier.js'

describe('classifyHook', () => {
  // -----------------------------------------------------------------------
  // Data hooks — should be mocked
  // -----------------------------------------------------------------------

  it('classifies useQuery from @tanstack/react-query as data', () => {
    expect(classifyHook('useQuery', '@tanstack/react-query')).toBe('data')
  })

  it('classifies useAppLiveQuery from local import as data', () => {
    expect(classifyHook('useAppLiveQuery', '@/hooks/use-app-live-query')).toBe('data')
  })

  it('classifies useAuthStore from local import as data', () => {
    expect(classifyHook('useAuthStore', '@/stores/auth')).toBe('data')
  })

  it('classifies useDevToolStore from local import as data (matches useXxxStore)', () => {
    expect(classifyHook('useDevToolStore', '@/stores/devtool')).toBe('data')
  })

  it('classifies useSWR from swr as data', () => {
    expect(classifyHook('useSWR', 'swr')).toBe('data')
  })

  it('classifies useFetch from npm as data', () => {
    expect(classifyHook('useFetch', 'some-fetch-lib')).toBe('data')
  })

  it('classifies useLiveQuery from dexie as data', () => {
    expect(classifyHook('useLiveQuery', 'dexie-react-hooks')).toBe('data')
  })

  it('classifies unknown local hook as data', () => {
    expect(classifyHook('useCustomData', '@/hooks/custom')).toBe('data')
  })

  it('classifies unknown relative-import hook as data', () => {
    expect(classifyHook('useMyThing', '../hooks/my-thing')).toBe('data')
  })

  // -----------------------------------------------------------------------
  // Provider hooks — should NOT be mocked
  // -----------------------------------------------------------------------

  it('classifies useNavigate from react-router-dom as provider', () => {
    expect(classifyHook('useNavigate', 'react-router-dom')).toBe('provider')
  })

  it('classifies useParams from react-router-dom as provider', () => {
    expect(classifyHook('useParams', 'react-router-dom')).toBe('provider')
  })

  it('classifies useLocation from react-router-dom as provider', () => {
    expect(classifyHook('useLocation', 'react-router-dom')).toBe('provider')
  })

  it('classifies useSearchParams from react-router-dom as provider', () => {
    expect(classifyHook('useSearchParams', 'react-router-dom')).toBe('provider')
  })

  it('classifies useForm from react-hook-form as provider', () => {
    expect(classifyHook('useForm', 'react-hook-form')).toBe('provider')
  })

  it('classifies useFormContext from react-hook-form as provider', () => {
    expect(classifyHook('useFormContext', 'react-hook-form')).toBe('provider')
  })

  it('classifies useTranslation from react-i18next as provider', () => {
    expect(classifyHook('useTranslation', 'react-i18next')).toBe('provider')
  })

  it('classifies useMutation from @tanstack/react-query as provider', () => {
    expect(classifyHook('useMutation', '@tanstack/react-query')).toBe('provider')
  })

  it('classifies unknown npm hook as provider', () => {
    expect(classifyHook('useSomething', 'some-library')).toBe('provider')
  })

  // -----------------------------------------------------------------------
  // Edge cases: exact name match takes precedence over package match
  // -----------------------------------------------------------------------

  it('classifies useNavigate as provider even with unknown import path', () => {
    expect(classifyHook('useNavigate', 'some-router-lib')).toBe('provider')
  })

  it('classifies useQuery from unknown npm package as data (name pattern match)', () => {
    expect(classifyHook('useQuery', 'some-query-lib')).toBe('data')
  })

  // -----------------------------------------------------------------------
  // Edge: next/router and next/navigation are provider packages
  // -----------------------------------------------------------------------

  it('classifies hook from next/router as provider', () => {
    expect(classifyHook('useRouter', 'next/router')).toBe('provider')
  })

  it('classifies hook from next/navigation as provider', () => {
    expect(classifyHook('usePathname', 'next/navigation')).toBe('provider')
  })
})
