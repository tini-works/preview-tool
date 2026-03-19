import { useRooms } from '../hooks/useRooms'

export default function HomePage() {
  const { rooms, isLoading, error, refetch } = useRooms()
  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>
  if (rooms.length === 0) return <div>No rooms</div>
  return (
    <div>
      {rooms.map((r) => (
        <div key={r.id}>
          {r.name} ({r.capacity})
        </div>
      ))}
      <button onClick={refetch}>Refresh</button>
    </div>
  )
}
