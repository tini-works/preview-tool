import React from 'react'
import { useRooms } from '@/hooks/useRooms'
import { useBookings } from '@/hooks/useBookings'
import { useServerClock } from '@/hooks/useServerClock'
import { useToast } from '@/contexts/toast'
import { useNavigate } from 'react-router-dom'

export default function HomePage() {
  const { rooms, isLoading, error } = useRooms()
  const { bookings } = useBookings()
  const { currentTime, isConnected } = useServerClock()
  const { showToast, dismissToast } = useToast()
  const navigate = useNavigate()

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

  return (
    <div>
      <h1>Rooms ({rooms.length})</h1>
      <p>Time: {currentTime}</p>
      <p>Connected: {isConnected ? 'yes' : 'no'}</p>
      <ul>
        {rooms.map((r: any) => <li key={r.id}>{r.name}</li>)}
      </ul>
    </div>
  )
}
