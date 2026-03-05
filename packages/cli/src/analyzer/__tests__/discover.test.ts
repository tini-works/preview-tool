import { describe, it, expect } from 'vitest'
import { discoverScreens } from '../discover.js'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('discoverScreens for external apps', () => {
  it('discovers standalone .tsx files in src/pages/', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'home.tsx'), 'export default function Home() { return <div>Home</div> }')
    await writeFile(join(dir, 'src', 'pages', 'login.tsx'), 'export default function Login() { return <div>Login</div> }')

    const screens = await discoverScreens(dir, 'src/pages/**/*.tsx')

    expect(screens).toHaveLength(2)
    expect(screens.map(s => s.route).sort()).toEqual(['/', '/login'].sort())
  })

  it('discovers admin/ subdirectory pages', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await mkdir(join(dir, 'src', 'pages', 'admin'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'admin', 'dashboard.tsx'), 'export default function Dashboard() { return <div>Dashboard</div> }')
    await writeFile(join(dir, 'src', 'pages', 'admin', 'services.tsx'), 'export default function Services() { return <div>Services</div> }')

    const screens = await discoverScreens(dir, 'src/pages/**/*.tsx')

    expect(screens).toHaveLength(2)
    expect(screens.map(s => s.route).sort()).toEqual(['/admin/dashboard', '/admin/services'].sort())
  })

  it('derives route / for home.tsx', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'home.tsx'), 'export default function Home() {}')

    const screens = await discoverScreens(dir, 'src/pages/**/*.tsx')

    expect(screens[0].route).toBe('/')
  })

  it('skips App.tsx and main.tsx', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'home.tsx'), 'export default function Home() {}')
    await writeFile(join(dir, 'src', 'App.tsx'), 'export default function App() {}')
    await writeFile(join(dir, 'src', 'main.tsx'), 'ReactDOM.createRoot()')

    const screens = await discoverScreens(dir, 'src/**/*.tsx')

    const routes = screens.map(s => s.route)
    expect(routes).toContain('/')
    expect(routes).not.toContain('/App')
    expect(routes).not.toContain('/main')
  })
})
