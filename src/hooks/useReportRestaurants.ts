import { useQuery } from "@tanstack/react-query";
import { getApiBase } from "@/lib/apiBase";
import { getToken } from "@/lib/authStorage";
import { useAuth } from "@/hooks/useAuth";

export type ReportRestaurant = {
  restaurant_id: string;
  restaurant_name: string;
};

export function useReportRestaurants() {
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";

  return useQuery<{ restaurants: ReportRestaurant[] }>({
    queryKey: ["accessible-restaurants"],
    queryFn: async () => {
      const token = getToken();
      const res = await fetch(`${getApiBase()}/api/stats/accessible-restaurants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load restaurants for filter");
      return res.json();
    },
    staleTime: 60_000,
    meta: { isSuperAdmin },
  });
}
