export interface Room {
  id: string
  name: string
  capacity: number
}

export interface UseRoomsReturn {
  rooms: Room[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useRooms(): UseRoomsReturn {
  throw new Error('not implemented')
}
