import { describe, it, expect } from 'vitest'
import { extractHookReturnType, extractUseStateType, extractStoreSelectorType } from '../extract-types.js'
import { Project, SyntaxKind } from 'ts-morph'

function getFirstCallExpression(code: string) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: 4, strict: true },
  })
  const sf = project.createSourceFile('test.tsx', code)
  const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression)
  return { call: calls[0], typeChecker: project.getTypeChecker() }
}

function getAllCallExpressions(code: string) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: 4, strict: true },
  })
  const sf = project.createSourceFile('test.tsx', code)
  const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression)
  return { calls, typeChecker: project.getTypeChecker() }
}

describe('extractHookReturnType', () => {
  it('resolves return type of a function returning an object', () => {
    const { call, typeChecker } = getFirstCallExpression(`
      function useUser(): { name: string; age: number; active: boolean } {
        return { name: 'John', age: 30, active: true }
      }
      const result = useUser()
    `)
    const info = extractHookReturnType(call, typeChecker)
    expect(info).not.toBeNull()
    expect(info!.confidence).toBe('full')
    expect(info!.properties).toContain('name')
    expect(info!.properties).toContain('age')
    expect(info!.properties).toContain('active')
    expect(info!.methods).toEqual([])
    expect(info!.shape.name).toBe('Sample Name')
    expect(info!.shape.age).toBe(0)
    expect(info!.shape.active).toBe(false)
  })

  it('classifies methods vs properties', () => {
    const { call, typeChecker } = getFirstCallExpression(`
      function useStore(): { data: string; setData: (val: string) => void; count: number } {
        return { data: '', setData: () => {}, count: 0 }
      }
      const result = useStore()
    `)
    const info = extractHookReturnType(call, typeChecker)
    expect(info).not.toBeNull()
    expect(info!.properties).toContain('data')
    expect(info!.properties).toContain('count')
    expect(info!.methods).toContain('setData')
  })

  it('handles nested object types', () => {
    const { call, typeChecker } = getFirstCallExpression(`
      interface Doctor {
        name: string
        specialties: string[]
      }
      function useDoctor(): Doctor {
        return { name: 'Dr. Smith', specialties: ['General'] }
      }
      const result = useDoctor()
    `)
    const info = extractHookReturnType(call, typeChecker)
    expect(info).not.toBeNull()
    expect(info!.confidence).toBe('full')
    expect(info!.properties).toContain('name')
    expect(info!.properties).toContain('specialties')
    expect(info!.shape.name).toBe('Sample Name')
    expect(Array.isArray(info!.shape.specialties)).toBe(true)
  })

  it('returns none confidence for any type', () => {
    const { call, typeChecker } = getFirstCallExpression(`
      function useAnything(): any { return null }
      const result = useAnything()
    `)
    const info = extractHookReturnType(call, typeChecker)
    expect(info).not.toBeNull()
    expect(info!.confidence).toBe('none')
  })

  it('handles nullable union types', () => {
    const { call, typeChecker } = getFirstCallExpression(`
      interface User { name: string; email: string }
      function useUser(): User | null {
        return null
      }
      const result = useUser()
    `)
    const info = extractHookReturnType(call, typeChecker)
    expect(info).not.toBeNull()
    // Should resolve the User branch, not null
    expect(info!.properties).toContain('name')
    expect(info!.properties).toContain('email')
  })
})

describe('extractUseStateType', () => {
  it('resolves explicit generic type via type argument node', () => {
    // Use a direct type argument that the TypeChecker can resolve
    // without needing React's actual type definitions
    const code = `
      interface MaintenanceState {
        enabled: boolean
        message: string
        startDate: string
      }
      function useState<T>(init: T | null): [T, (v: T) => void] {
        return [init as T, () => {}]
      }
      function Screen() {
        const [config, setConfig] = useState<MaintenanceState>(null)
      }
    `
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { jsx: 4, strict: true },
    })
    const sf = project.createSourceFile('test.tsx', code)
    const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression)
    const useStateCall = calls.find(c => c.getExpression().getText() === 'useState')
    expect(useStateCall).toBeDefined()

    const typeChecker = project.getTypeChecker()
    const info = extractUseStateType(useStateCall!, typeChecker)
    expect(info).not.toBeNull()
    expect(info!.properties).toContain('enabled')
    expect(info!.properties).toContain('message')
    expect(info!.properties).toContain('startDate')
    expect(info!.shape.enabled).toBe(false)
    expect(info!.shape.message).toBe('Sample text')
  })

  it('returns null when no type argument and no inferrable type', () => {
    const { call, typeChecker } = getFirstCallExpression(`
      function useState(init: any): any { return [init, () => {}] }
      const [value, setValue] = useState(null)
    `)
    const info = extractUseStateType(call, typeChecker)
    // Without proper React types, this should return null or none confidence
    expect(info === null || info?.confidence === 'none').toBe(true)
  })
})

describe('extractStoreSelectorType', () => {
  it('resolves store state type from selector parameter', () => {
    // Use typed parameter annotation so TypeChecker can resolve the type
    const { calls, typeChecker } = getAllCallExpressions(`
      interface StoreState {
        doctor: { name: string }
        setDoctor: (d: any) => void
        count: number
      }
      declare function useBookingStore(selector: (state: StoreState) => any): any
      const doctor = useBookingStore((s: StoreState) => s.doctor)
    `)
    // Find the useBookingStore call (not any nested call)
    const call = calls.find(c => c.getExpression().getText() === 'useBookingStore')
    expect(call).toBeDefined()
    const info = extractStoreSelectorType(call!, typeChecker)
    expect(info).not.toBeNull()
    expect(info!.properties).toContain('doctor')
    expect(info!.properties).toContain('count')
    expect(info!.methods).toContain('setDoctor')
  })

  it('returns null when no selector argument', () => {
    const { call, typeChecker } = getFirstCallExpression(`
      function useStore(): any { return {} }
      const result = useStore()
    `)
    const info = extractStoreSelectorType(call, typeChecker)
    expect(info).toBeNull()
  })
})
