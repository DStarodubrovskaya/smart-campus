import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

export interface AdminUser {
  app_user_id: string
  role: 'Student' | 'Lecturer'
  trust_score: number
  tier: string
  successful_reports: number
  total_reports: number
  created_at: string
}

export const useAdminUsers = (enabled: boolean) => {
  return useQuery({
    queryKey: ['adminUsers'],
    queryFn: async (): Promise<AdminUser[]> => {
      const response = await axios.get('http://localhost:8000/api/admin/users')
      return response.data.users
    },
    enabled: enabled, // Only fetch when admin panel is open
  })
}

export const useUpdateUserAdmin = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      app_user_id,
      trust_score,
      tier,
    }: {
      app_user_id: string
      trust_score: number
      tier: string
    }) => {
      const response = await axios.put(
        `http://localhost:8000/api/admin/users/${app_user_id}`,
        { trust_score, tier }
      )
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] })
    },
  })
}

export const useDeleteUserAdmin = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (app_user_id: string) => {
      const response = await axios.delete(
        `http://localhost:8000/api/admin/users/${app_user_id}`
      )
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] })
    },
  })
}