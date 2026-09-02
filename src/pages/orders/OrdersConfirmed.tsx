import { CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OrdersListView } from "@/components/orders/OrdersListView";

export default function OrdersConfirmed() {
  const { t } = useTranslation(["orders", "common"]);
  return (
    <OrdersListView
      status="confirmed"
      title={t("orders:confirmed", "Confirmed orders")}
      description={t("orders:orderConfirmedAt", "Confirmed by restaurant")}
      icon={<CheckCircle2 className="h-6 w-6" />}
    />
  );
}