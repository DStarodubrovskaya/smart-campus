import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

const apiUrl = import.meta.env.VITE_API_URL

export interface ReportPayload {
  app_user_id: string
  room_id: number
  reported_status: 'FREE' | 'BUSY'
}

export const useSubmitReport = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: ReportPayload) => {
      const res = await axios.post(`${apiUrl}/api/reports/submit`, payload)
      return res.data as { status: string; message: string; room_new_status: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
    },
  })
}