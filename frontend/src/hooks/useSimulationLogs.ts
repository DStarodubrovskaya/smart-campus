import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

// Log entry as returned by the backend
export interface SimulationLog {
  id?: string;
  timestamp: string;       // e.g., "12:24:01"
  b_code: string;        // e.g., "Agent_43"
  room: string;         // e.g., "104"
  event_msg: string;          // e.g., "reported BUSY" or "applied trust penalty (-10)"
  type: 'success' | 'error' | 'info'; 
}

const fetchLogs = async (): Promise<SimulationLog[]> => {
  const apiUrl = import.meta.env.VITE_API_URL
  const response = await axios.get(`${apiUrl}/api/simulation/logs`)
  return response.data
}

export const useSimulationLogs = (isSimulationActive: boolean) => {
  return useQuery<SimulationLog[]>({
    queryKey: ['simulationLogs'],
    queryFn: fetchLogs,
    // Poll once per second while the simulation is running
    refetchInterval: isSimulationActive ? 1000 : false,
  })
}