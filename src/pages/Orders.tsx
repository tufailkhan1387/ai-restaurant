import { ClipboardList } from "lucide-react";
import { OrdersListView } from "@/components/orders/OrdersListView";

export default function Orders() {
  return (
    <OrdersListView
      status="all"
      title="All orders"
      description="Verify orders, assign drivers, and track delivery"
      icon={<ClipboardList className="h-6 w-6" />}
    />
  );
}
