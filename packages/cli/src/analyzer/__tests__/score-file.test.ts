import { describe, it, expect } from 'vitest'
import { scoreFile } from '../score-file.js'

describe('scoreFile', () => {
  it('gives high score for file in screens/ directory', () => {
    const score = scoreFile(
      'src/screens/Dashboard.tsx',
      'export default function Dashboard() {}',
      []
    )
    // screens/ dir (+30) + default export (+15) = 45
    expect(score).toBeGreaterThanOrEqual(30)
  })

  it('gives high score for *Page.tsx files', () => {
    const score = scoreFile(
      'src/HomePage.tsx',
      'function HomePage() { return <div /> }',
      []
    )
    // *Page suffix (+20)
    expect(score).toBeGreaterThanOrEqual(20)
  })

  it('gives low score for utils/ files', () => {
    const score = scoreFile(
      'src/utils/format.ts',
      'export function formatDate(d: Date) { return d.toISOString() }',
      []
    )
    // No screen directory, no screen suffix, no routing hooks, no default export
    expect(score).toBeLessThan(30)
  })

  it('gives high score for files with routing hooks', () => {
    const content = `
      import { useParams, useNavigate } from 'react-router-dom'
      export default function UserProfile() {
        const { id } = useParams()
        const navigate = useNavigate()
        return <div>User {id}</div>
      }
    `
    const score = scoreFile('src/UserProfile.tsx', content, [])
    // routing hooks (+15) + default export (+15) = 30
    expect(score).toBeGreaterThanOrEqual(30)
  })

  it('gives 50+ for route-referenced files', () => {
    const score = scoreFile(
      'src/screens/Dashboard.tsx',
      'export default function Dashboard() {}',
      ['src/screens/Dashboard.tsx']
    )
    // route referenced (+50) + screens/ dir (+30) + default export (+15) = 95
    expect(score).toBeGreaterThanOrEqual(50)
  })

  it('gives bonus for data-fetching hooks', () => {
    const contentWithHook = `
      import { useQuery } from '@tanstack/react-query'
      export default function DataPage() {
        const { data } = useQuery({ queryKey: ['items'] })
        return <div>{data}</div>
      }
    `
    const contentWithout = `
      export default function PlainPage() {
        return <div>Hello</div>
      }
    `
    const scoreWith = scoreFile('src/pages/Data.tsx', contentWithHook, [])
    const scoreWithout = scoreFile('src/pages/Plain.tsx', contentWithout, [])

    // Data-fetching hook adds +10
    expect(scoreWith).toBeGreaterThan(scoreWithout)
    expect(scoreWith - scoreWithout).toBe(10)
  })

  it('gives bonus for PascalCase index.tsx files', () => {
    const score = scoreFile(
      'src/screens/Dashboard/index.tsx',
      'export default function Dashboard() {}',
      []
    )
    // screens/ dir (+30) + default export (+15) + PascalCase index (+10) = 55
    expect(score).toBeGreaterThanOrEqual(55)
  })

  it('does not give PascalCase bonus for lowercase directory index', () => {
    const scoreUpper = scoreFile(
      'src/screens/Dashboard/index.tsx',
      'export default function Dashboard() {}',
      []
    )
    const scoreLower = scoreFile(
      'src/screens/dashboard/index.tsx',
      'export default function Dashboard() {}',
      []
    )
    // Only PascalCase directory gets the bonus
    expect(scoreUpper).toBeGreaterThan(scoreLower)
  })
})
