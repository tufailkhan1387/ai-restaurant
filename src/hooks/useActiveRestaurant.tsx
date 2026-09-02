import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Active restaurant for dashboard / menu / orders queries.
 * - Members: first membership (ordered); no fallback to other tenants' restaurants.
 * - Drivers: first row in driver_restaurants when no membership.
 * - Super admins: first active restaurant for platform-wide tools (until a switcher exists).
 */
export function useActiveRestaurant() {
  const { user, role } = useAuth();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (!user?.id) {
          if (!cancelled) setRestaurantId(null);
          return;
        }

        const { data: memberRows } = await supabase
          .from("restaurant_members")
          .select("restaurant_id, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        const memberIds = [...new Set((memberRows as { restaurant_id: string }[] | null)?.map((m) => m.restaurant_id) ?? [])].filter(Boolean);
        
        // 1. Check if user explicitly stored a preferred restaurant in localStorage
        const storedRid = localStorage.getItem("active_restaurant_id");
        if (storedRid && (memberIds.includes(storedRid) || role === "super_admin")) {
          if (!cancelled) setRestaurantId(storedRid);
          return;
        }

        if (memberIds.length) {
          // If user has "Royal Restaurant", pick it, otherwise latest membership
          const { data: rests } = await supabase
            .from("restaurants")
            .select("id, name")
            .in("id", memberIds);

          const restList = (rests as { id: string; name: string }[]) || [];
          const preferred = restList.find((r) => r.name?.toLowerCase().includes("royal")) ||
                            restList.find((r) => r.name && r.name.length > 2 && !/^\d+$/.test(r.name)) ||
                            restList[0];

          const chosenId = preferred ? preferred.id : memberIds[0];
          if (!cancelled) setRestaurantId(chosenId);
          return;
        }

        if (role === "driver") {
          const { data: driverRow } = await supabase.from("drivers").select("id").eq("user_id", user.id).maybeSingle();
          const driverPk = (driverRow as { id?: string } | null)?.id;
          if (driverPk) {
            const { data: drRows } = await supabase
              .from("driver_restaurants")
              .select("restaurant_id")
              .eq("driver_id", driverPk)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            const rid = (drRows as { restaurant_id?: string } | null)?.restaurant_id;
            if (rid) {
              if (!cancelled) setRestaurantId(rid);
              return;
            }
          }
        }

        if (role === "super_admin") {
          const { data: r } = await supabase
            .from("restaurants")
            .select("id, name")
            .eq("is_active", true)
            .order("created_at", { ascending: false });

          const restList = (r as { id: string; name: string }[]) || [];
          const preferred = restList.find((x) => x.name?.toLowerCase().includes("royal")) || restList[0];
          if (!cancelled) setRestaurantId(preferred?.id ?? null);
          return;
        }

        if (!cancelled) setRestaurantId(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, role]);

  return { restaurantId, loading };
}
