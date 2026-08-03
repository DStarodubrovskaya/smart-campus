import { useMutation } from "@tanstack/react-query";
import axios from "axios";

export interface RoomForecastItem {
  building_number: string;
  building_name: string;
  room_number: string;
  has_schedule_class: boolean;
  prediction: "FREE" | "BUSY";
  probability_free: number;
  probability_free_percent: string;
}

export interface ForecastPayload {
  day_of_week: number;
  hour: number;
  building_number: string;
  room_number?: string;
}

export interface ForecastResponse {
  status: string;
  day_of_week: number;
  hour: number;
  building_filter: string;
  top_rooms: RoomForecastItem[];
  specific_room: RoomForecastItem | null;
  room_exists?: boolean; // <-- Добавили это поле
  model_used: string;
}

export const usePredictAvailability = () => {
  return useMutation({
    mutationFn: async (payload: ForecastPayload): Promise<ForecastResponse> => {
    const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/ml/forecast`, {
          params: {
          day_of_week: payload.day_of_week,
          hour: payload.hour,
          building_number: payload.building_number || "הכל",
          room_number: payload.room_number || "",
        },
      });
      return response.data;
    },
  });
};