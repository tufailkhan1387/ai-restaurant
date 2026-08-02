import { Inbox } from "lucide-react";
import { OrdersListView } from "@/components/orders/OrdersListView";

export default function OrdersNew() {
  return (
    <OrdersListView
      status="pending"
      title="New orders"
      description="Review and confirm incoming orders"
      icon={<Inbox className="h-6 w-6" />}
    />
  );
}