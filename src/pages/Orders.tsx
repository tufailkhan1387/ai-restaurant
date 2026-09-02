import { ClipboardList } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OrdersListView } from "@/components/orders/OrdersListView";

export default function Orders() {
  const { t } = useTranslation(["orders", "common"]);
  return (
    <OrdersListView
      status="all"
      title={t("orders:all", "All orders")}
      description={t("orders:subtitle", "Verify orders, assign drivers, and track delivery")}
      icon={<ClipboardList className="h-6 w-6" />}
    />
  );
}

