import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

interface Task {
  id: string
  title: string
  completed: boolean
}

export default function Dashboard() {
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all')

  const { data: tasks, isLoading, error } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: () => fetch('/api/tasks').then((res) => res.json()),
  })

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {String(error)}</div>

  const filtered = (tasks ?? []).filter((task) => {
    if (filter === 'active') return !task.completed
    if (filter === 'done') return task.completed
    return true
  })

  return (
    <div>
      <h1>Dashboard</h1>
      <div>
        <button onClick={() => setFilter('all')}>All</button>
        <button onClick={() => setFilter('active')}>Active</button>
        <button onClick={() => setFilter('done')}>Done</button>
      </div>
      <ul>
        {filtered.map((task) => (
          <li key={task.id}>
            {task.title} {task.completed ? '(done)' : ''}
          </li>
        ))}
      </ul>
    </div>
  )
}
