import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

export const useResumeSimulation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await axios.post(`${import.meta.env.VITE_API_URL}/api/simulation/resume`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulationStatus'] })
    }
  })
}