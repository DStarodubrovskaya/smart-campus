import { useMutation } from '@tanstack/react-query'
import axios from 'axios'

const stopEngine = async (): Promise<void> => {
  const apiUrl = import.meta.env.VITE_API_URL
  await axios.post(`${apiUrl}/api/simulation/stop`)
}

export const useStopSimulation = () => {
  return useMutation({
    mutationFn: stopEngine,
    onError: (error) => {
      console.error('Failed to stop the simulation engine:', error)
    }
  })
}