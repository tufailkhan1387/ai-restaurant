import { Inbox } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OrdersListView } from "@/components/orders/OrdersListView";

export default function OrdersNew() {
  const { t } = useTranslation(["orders", "common"]);
  return (
    <OrdersListView
      status="pending"
      title={t("orders:newOrders", "New orders")}
      description={t("orders:subtitle", "Review and confirm incoming orders")}
      icon={<Inbox className="h-6 w-6" />}
    />
  );
}