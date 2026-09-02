import { PackageCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OrdersListView } from "@/components/orders/OrdersListView";

export default function OrdersDelivered() {
  const { t } = useTranslation(["orders", "common"]);
  return (
    <OrdersListView
      status="delivered"
      title={t("orders:delivered", "Delivered")}
      description={t("orders:orderDeliveredAt", "Completed orders")}
      icon={<PackageCheck className="h-6 w-6" />}
    />
  );
}