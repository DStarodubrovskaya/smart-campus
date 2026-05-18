import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

// 1. Define what payload your FastAPI backend expects to receive
export interface SimulationPayload {
  scenario_id: number // 1, 2, 3, or 4 based on your backend update
}

// 2. The poster function that communicates with your FastAPI server
const triggerSimulation = async (payload: SimulationPayload): Promise<void> => {
  const apiUrl = import.meta.env.VITE_API_URL
  // Assumes your backend designer mapped scenarios to a /api/simulation/start endpoint
  await axios.post(`${apiUrl}/api/simulation/start`, payload)
}

// 3. Your Custom Mutation Hook
export const useStartSimulation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: triggerSimulation,
    // 💡 Architectural trick: Once a simulation successfully triggers, 
    // tell React Query to immediately wipe out old room caches and fetch the fresh scenario states!
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
    },
    onError: (error) => {
      console.error('Failed to wake up the simulation engine:', error)
    }
  })
}