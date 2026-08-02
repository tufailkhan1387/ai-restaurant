import type { ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  restaurants: { restaurant_id: string; restaurant_name: string }[];
  restaurantId: string;
  onRestaurantChange: (value: string) => void;
  showRestaurantFilter?: boolean;
  periodDays?: string;
  onPeriodChange?: (value: string) => void;
  showPeriod?: boolean;
  extra?: ReactNode;
};

const PERIOD_OPTIONS = [
  { value: "0", label: "All time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

export function ReportFilters({
  restaurants,
  restaurantId,
  onRestaurantChange,
  showRestaurantFilter = true,
  periodDays,
  onPeriodChange,
  showPeriod = false,
  extra,
}: Props) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
      {showRestaurantFilter && restaurants.length > 1 && (
        <Select value={restaurantId} onValueChange={onRestaurantChange}>
          <SelectTrigger className="w-full sm:w-[260px]">
            <SelectValue placeholder="Restaurant" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All restaurants</SelectItem>
            {restaurants.map((r) => (
              <SelectItem key={r.restaurant_id} value={r.restaurant_id}>
                {r.restaurant_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {showPeriod && onPeriodChange && (
        <Select value={periodDays ?? "0"} onValueChange={onPeriodChange}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {extra}
    </div>
  );
}
