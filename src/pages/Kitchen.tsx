import { ChefHat } from "lucide-react";
import { OrdersListView } from "@/components/orders/OrdersListView";

export default function Kitchen() {
  return (
    <OrdersListView
      status="all"
      title="Kitchen"
      description="Orders for the kitchen, with the same list and filters as Orders."
      icon={<ChefHat className="h-6 w-6" />}
    />
  );
}
