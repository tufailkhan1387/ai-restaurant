import { CheckCircle2 } from "lucide-react";
import { OrdersListView } from "@/components/orders/OrdersListView";

export default function OrdersConfirmed() {
  return (
    <OrdersListView
      status="confirmed"
      title="Confirmed orders"
      description="Customer has been notified by email"
      icon={<CheckCircle2 className="h-6 w-6" />}
    />
  );
}