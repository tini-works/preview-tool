import { createBrowserRouter } from 'react-router-dom'
import Dashboard from './screens/Dashboard'
import Settings from './screens/Settings'
import Login from './screens/Login'

export const router = createBrowserRouter([
  { path: '/', element: <Dashboard /> },
  { path: '/settings', element: <Settings /> },
  { path: '/login', element: <Login /> },
])
