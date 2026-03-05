import { useState, useEffect } from 'react'

export default function Dashboard() {
  const [items, setItems] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setTimeout(() => {
      setItems(['Task 1', 'Task 2', 'Task 3'])
      setIsLoading(false)
    }, 1000)
  }, [])

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>
  return (
    <div>
      <h1>Dashboard</h1>
      <ul>{items.map(item => <li key={item}>{item}</li>)}</ul>
    </div>
  )
}
