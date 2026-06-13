import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

// 1. Define the TypeScript interface matching your backend's room data structure
export interface Room {
  id: number
  room_id: string       
  building_number: string 
  occupancy_status: 'FREE' | 'BUSY' | 'PARTIAL' | 'UNKNOWN' 
  last_verified?: string
}

// 2. Fetcher function using your environment variable
const fetchRooms = async (): Promise<Room[]> => {
  const apiUrl = import.meta.env.VITE_API_URL 
  const response = await axios.get(`${apiUrl}/api/rooms`) 
  return response.data
}

// 3. Your Custom Hook containing the real-time polling logic
export const useRooms = (isSimulationActive: boolean) => {
  return useQuery<Room[]>({
    queryKey: ['rooms'], 
    queryFn: fetchRooms,
    // Real-time trick: Poll every 1 second only if the simulation is running!
    refetchInterval: isSimulationActive ? 1000 : false, 
  })
}