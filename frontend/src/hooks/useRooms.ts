import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

// Room record as returned by GET /api/rooms
export interface Room {
  id: number
  room_id: string       
  building_number: string 
  occupancy_status: 'FREE' | 'BUSY' | 'PARTIAL' | 'UNKNOWN' 
  last_verified?: string
}

const fetchRooms = async (): Promise<Room[]> => {
  const apiUrl = import.meta.env.VITE_API_URL 
  const response = await axios.get(`${apiUrl}/api/rooms`) 
  return response.data
}

export const useRooms = (isSimulationActive: boolean) => {
  return useQuery<Room[]>({
    queryKey: ['rooms'], 
    queryFn: fetchRooms,
    // Poll once per second while the simulation is running
    refetchInterval: isSimulationActive ? 1000 : false, 
  })
}