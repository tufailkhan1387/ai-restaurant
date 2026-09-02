import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// English namespaces
import enCommon from "./locales/en/common.json";
import enSidebar from "./locales/en/sidebar.json";
import enDashboard from "./locales/en/dashboard.json";
import enOrders from "./locales/en/orders.json";
import enMenu from "./locales/en/menu.json";
import enDeals from "./locales/en/deals.json";
import enCoupons from "./locales/en/coupons.json";
import enCuisines from "./locales/en/cuisines.json";
import enReports from "./locales/en/reports.json";
import enUsers from "./locales/en/users.json";
import enSuperAdmin from "./locales/en/superAdmin.json";
import enRestaurantSettings from "./locales/en/restaurantSettings.json";
import enOrdering from "./locales/en/ordering.json";
import enTrack from "./locales/en/track.json";
import enDrivers from "./locales/en/drivers.json";
import enVehicles from "./locales/en/vehicles.json";
import enCalls from "./locales/en/calls.json";
import enSettings from "./locales/en/settings.json";
import enAuth from "./locales/en/auth.json";

// French namespaces
import frCommon from "./locales/fr/common.json";
import frSidebar from "./locales/fr/sidebar.json";
import frDashboard from "./locales/fr/dashboard.json";
import frOrders from "./locales/fr/orders.json";
import frMenu from "./locales/fr/menu.json";
import frDeals from "./locales/fr/deals.json";
import frCoupons from "./locales/fr/coupons.json";
import frCuisines from "./locales/fr/cuisines.json";
import frReports from "./locales/fr/reports.json";
import frUsers from "./locales/fr/users.json";
import frSuperAdmin from "./locales/fr/superAdmin.json";
import frRestaurantSettings from "./locales/fr/restaurantSettings.json";
import frOrdering from "./locales/fr/ordering.json";
import frTrack from "./locales/fr/track.json";
import frDrivers from "./locales/fr/drivers.json";
import frVehicles from "./locales/fr/vehicles.json";
import frCalls from "./locales/fr/calls.json";
import frSettings from "./locales/fr/settings.json";
import frAuth from "./locales/fr/auth.json";

export const defaultNS = "common";
export const resources = {
  en: {
    common: enCommon,
    sidebar: enSidebar,
    dashboard: enDashboard,
    orders: enOrders,
    menu: enMenu,
    deals: enDeals,
    coupons: enCoupons,
    cuisines: enCuisines,
    reports: enReports,
    users: enUsers,
    superAdmin: enSuperAdmin,
    restaurantSettings: enRestaurantSettings,
    ordering: enOrdering,
    track: enTrack,
    drivers: enDrivers,
    vehicles: enVehicles,
    calls: enCalls,
    settings: enSettings,
    auth: enAuth,
  },
  fr: {
    common: frCommon,
    sidebar: frSidebar,
    dashboard: frDashboard,
    orders: frOrders,
    menu: frMenu,
    deals: frDeals,
    coupons: frCoupons,
    cuisines: frCuisines,
    reports: frReports,
    users: frUsers,
    superAdmin: frSuperAdmin,
    restaurantSettings: frRestaurantSettings,
    ordering: frOrdering,
    track: frTrack,
    drivers: frDrivers,
    vehicles: frVehicles,
    calls: frCalls,
    settings: frSettings,
    auth: frAuth,
  },
} as const;

const savedLanguage = (typeof window !== "undefined" && localStorage.getItem("app_language")) || "en";

i18n.use(initReactI18next).init({
  resources,
  lng: savedLanguage === "fr" ? "fr" : "en",
  fallbackLng: "en",
  defaultNS,
  interpolation: {
    escapeValue: false, // React already escapes by default
  },
});

export const changeAppLanguage = (lang: "en" | "fr") => {
  if (typeof window !== "undefined") {
    localStorage.setItem("app_language", lang);
  }
  return i18n.changeLanguage(lang);
};

export default i18n;
