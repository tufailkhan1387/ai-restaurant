import { ChefHat } from "lucide-react";
import { OrdersListView } from "@/components/orders/OrdersListView";

export default function OrdersPreparing() {
  return (
    <OrdersListView
      status={["preparing", "ready"]}
      title="Preparing"
      description="Orders in the kitchen"
      icon={<ChefHat className="h-6 w-6" />}
    />
  );
}