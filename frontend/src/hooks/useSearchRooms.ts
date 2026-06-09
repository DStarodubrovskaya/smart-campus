import { useMutation } from '@tanstack/react-query'
import axios from 'axios'

interface SearchParams {
  min_minutes: number
  building: string
}

export const useSearchRooms = () => {
  return useMutation({
    mutationFn: async (params: SearchParams) => {
      const apiUrl = import.meta.env.VITE_API_URL
      // Axios автоматически подставит параметры в URL: /api/rooms/search?min_minutes=60&building=507
      const response = await axios.get(`${apiUrl}/api/rooms/search`, { params })
      return response.data
    }
  })
}