/** Searchable sidebar destinations — keep in sync with `Sidebar.tsx`. */
export type SidebarNavSearchItem = {
  label: string;
  href: string;
  section: string;
  keywords?: string[];
  superAdminOnly?: boolean;
  /** Omit from command palette / search when user is super admin */
  hideForSuperAdmin?: boolean;
};

export const SIDEBAR_NAV_SEARCH_ITEMS: SidebarNavSearchItem[] = [
  { label: "Dashboard", href: "/", section: "Main", keywords: ["home", "overview"] },
  {
    label: "Customers",
    href: "/users/customers",
    section: "Users",
    keywords: ["users", "clients", "guests", "crm"],
  },
  {
    label: "Restaurant owners",
    href: "/users/restaurant-owners",
    section: "Users",
    keywords: ["users", "owners", "tenant", "membership"],
  },
  { label: "Orders", href: "/orders", section: "Orders", keywords: ["all orders", "order list"] },
  { label: "New orders", href: "/orders/new", section: "Orders", keywords: ["new", "inbox", "pending"] },
  { label: "Confirmed orders", href: "/orders/confirmed", section: "Orders", keywords: ["confirmed"] },
  { label: "Preparing orders", href: "/orders/preparing", section: "Orders", keywords: ["preparing", "kitchen", "chef"] },
  { label: "Out for delivery", href: "/orders/out-for-delivery", section: "Orders", keywords: ["delivery", "on the way", "shipping"] },
  { label: "Delivered orders", href: "/orders/delivered", section: "Orders", keywords: ["delivered", "completed"] },
  { label: "Menu items", href: "/menu", section: "Menu", keywords: ["menu", "categories", "food"] },
  { label: "Menu add-ons", href: "/menu?tab=addons", section: "Menu", keywords: ["addons", "extras", "modifiers", "options"] },
  { label: "Menu categories", href: "/menu?tab=categories", section: "Menu", keywords: ["categories", "menu groups"] },
  { label: "Menu sub-categories", href: "/menu?tab=sub-categories", section: "Menu", keywords: ["sub categories", "subcategories"] },

  { label: "Max Order", href: "/menu?tab=max-order", section: "Menu", keywords: ["max order", "limit", "quantity limit", "per order"] },
  { label: "Deals & Offers", href: "/deals", section: "Marketing", keywords: ["deals", "offers", "discounts", "promotions"] },
  { label: "Inventory", href: "/menu?tab=inventory", section: "Inventory", keywords: ["stock", "quantity", "inventory", "availability"] },
  { label: "Cuisines", href: "/cuisines", section: "Marketing", keywords: ["cuisine", "food type", "restaurant cuisine"] },
  {
    label: "My Restaurant",
    href: "/restaurant-settings",
    section: "Management",
    keywords: ["settings", "restaurant", "tenant"],
    hideForSuperAdmin: true,
  },
  { label: "Settings", href: "/settings", section: "Management", keywords: ["preferences", "account"] },
  {
    label: "Restaurants",
    href: "/restaurants",
    section: "Management",
    keywords: ["tenants", "all restaurants", "super"],
    superAdminOnly: true,
  },
  {
    label: "Restaurant report",
    href: "/reports/restaurant",
    section: "Reports",
    keywords: ["reports", "restaurant report", "commission", "sales", "performance", "earnings"],
  },
  {
    label: "Item report",
    href: "/reports/items",
    section: "Reports",
    keywords: ["reports", "menu item", "sku", "items sold", "sales by item"],
  },
  {
    label: "Best sellers",
    href: "/reports/best-sellers",
    section: "Reports",
    keywords: ["reports", "best selling", "top products", "rankings", "bestsellers"],
  },
  {
    label: "Inventory report",
    href: "/reports/inventory",
    section: "Reports",
    keywords: ["reports", "stock", "inventory", "low stock", "out of stock"],
  },
  {
    label: "Customer analytics",
    href: "/reports/customers",
    section: "Reports",
    keywords: ["reports", "customers", "repeat", "loyalty", "spend", "crm"],
  },
];

function normalize(s: string) {
  return s.trim().toLowerCase();
}

export function filterSidebarNavItems(
  query: string,
  options: { isSuperAdmin: boolean },
): SidebarNavSearchItem[] {
  const base = SIDEBAR_NAV_SEARCH_ITEMS.filter((i) => {
    if (i.superAdminOnly && !options.isSuperAdmin) return false;
    if (i.hideForSuperAdmin && options.isSuperAdmin) return false;
    return true;
  });
  const q = normalize(query);
  if (!q) return base;
  return base.filter((item) => {
    const blob = [item.label, item.href, item.section, ...(item.keywords ?? [])].join(" ").toLowerCase();
    return blob.includes(q);
  });
}
