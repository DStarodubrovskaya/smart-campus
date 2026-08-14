import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

export const usePauseSimulation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await axios.post(`${import.meta.env.VITE_API_URL}/api/simulation/pause`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulationStatus'] })
    }
  })
}