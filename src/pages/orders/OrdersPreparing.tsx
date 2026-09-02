import { ChefHat } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OrdersListView } from "@/components/orders/OrdersListView";

export default function OrdersPreparing() {
  const { t } = useTranslation(["orders", "common"]);
  return (
    <OrdersListView
      status={["preparing", "ready"]}
      title={t("orders:preparing", "Preparing")}
      description={t("orders:orderPreparingAt", "Orders in the kitchen")}
      icon={<ChefHat className="h-6 w-6" />}
    />
  );
}