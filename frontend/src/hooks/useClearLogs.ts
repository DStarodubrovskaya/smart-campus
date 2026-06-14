import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

export const useClearLogs = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async () => {
      const apiUrl = import.meta.env.VITE_API_URL
      await axios.post(`${apiUrl}/api/simulation/clear-logs`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulationLogs'] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['userHistory'] })
    },
    onError: (error) => {
      console.error('Failed to clear logs:', error)
      alert("שגיאה בניקוי ההיסטוריה. ודא שהסימולציה כבויה.")
    }
  })
}