import { Truck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OrdersListView } from "@/components/orders/OrdersListView";

export default function OrdersOutForDelivery() {
  const { t } = useTranslation(["orders", "common"]);
  return (
    <OrdersListView
      status={["assigned", "out_for_delivery"]}
      title={t("orders:outForDelivery", "Out for delivery")}
      description={t("orders:orderOutAt", "Driver assigned — on the way")}
      icon={<Truck className="h-6 w-6" />}
    />
  );
}