import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

export interface UserReportHistory {
  building_number: string
  room_number: string
  status: 'FREE' | 'BUSY'
  timestamp: string
}

interface HistoryResponse {
  status: string
  count: number
  reports: UserReportHistory[]
}

const fetchUserHistory = async (app_user_id: string): Promise<UserReportHistory[]> => {
  const apiUrl = import.meta.env.VITE_API_URL
  const response = await axios.get<HistoryResponse>(`${apiUrl}/api/users/${app_user_id}/history`)
  return response.data.reports
}

export const useUserHistory = (app_user_id: string | undefined) => {
  return useQuery({
    queryKey: ['userHistory', app_user_id],
    queryFn: () => fetchUserHistory(app_user_id!),
    enabled: !!app_user_id, // The hook will not send a request until there is a user ID.
  })
}