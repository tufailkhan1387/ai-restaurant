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
          .select("restaurant_id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true });

        const memberIds = [...new Set((memberRows as { restaurant_id: string }[] | null)?.map((m) => m.restaurant_id) ?? [])].filter(Boolean);
        if (memberIds.length) {
          if (!cancelled) setRestaurantId(memberIds[0]);
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
              .order("created_at", { ascending: true })
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
            .select("id")
            .eq("is_active", true)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (!cancelled) setRestaurantId(r?.id ?? null);
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
