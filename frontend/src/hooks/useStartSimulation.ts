import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

// Request payload for the simulation start endpoint
export interface SimulationPayload {
  scenario_id: number // 1–4, maps to a scenario CSV on the backend
}

// POSTs the selected scenario to the backend
const triggerSimulation = async (payload: SimulationPayload): Promise<void> => {
  const apiUrl = import.meta.env.VITE_API_URL
  await axios.post(`${apiUrl}/api/simulation/start`, payload)
}

export const useStartSimulation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: triggerSimulation,
    // Drop cached room data so the new scenario state is fetched immediately
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
    },
    onError: (error) => {
      console.error('Failed to wake up the simulation engine:', error)
    }
  })
}