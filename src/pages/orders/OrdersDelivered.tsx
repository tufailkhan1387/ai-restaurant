import { PackageCheck } from "lucide-react";
import { OrdersListView } from "@/components/orders/OrdersListView";

export default function OrdersDelivered() {
  return (
    <OrdersListView
      status="delivered"
      title="Delivered"
      description="Completed orders"
      icon={<PackageCheck className="h-6 w-6" />}
    />
  );
}