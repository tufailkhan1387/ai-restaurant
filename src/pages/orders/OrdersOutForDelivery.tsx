import { Truck } from "lucide-react";
import { OrdersListView } from "@/components/orders/OrdersListView";

export default function OrdersOutForDelivery() {
  return (
    <OrdersListView
      status={["assigned", "out_for_delivery"]}
      title="Out for delivery"
      description="Driver assigned — customer notified by SMS"
      icon={<Truck className="h-6 w-6" />}
    />
  );
}