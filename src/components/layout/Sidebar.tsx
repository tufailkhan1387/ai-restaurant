import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Settings,
  UtensilsCrossed as LogoIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  UtensilsCrossed,
  Tag,
  ClipboardList,
  ChefHat,
  Store,
  Inbox,
  CheckCircle2,
  Truck,
  PackageCheck,
  Boxes,
  Gauge,
  Layers,
  LayoutGrid,
  ListTree,
  PlusSquare,
  Wallet,
  Ticket,
  FileBarChart,
  Package,
  Users,
  Award,
  BarChart3,
  UserCircle,
  Crown,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useActiveRestaurant } from "@/hooks/useActiveRestaurant";
import { supabase } from "@/integrations/supabase/client";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const ordersChildren = [
  { icon: Inbox, label: "New", href: "/orders/new" },
  { icon: CheckCircle2, label: "Confirmed", href: "/orders/confirmed" },
  { icon: ChefHat, label: "Preparing", href: "/orders/preparing" },
  { icon: Truck, label: "Out for delivery", href: "/orders/out-for-delivery" },
  { icon: PackageCheck, label: "Delivered", href: "/orders/delivered" },
];

const navigationItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
  { icon: Tag, label: "Deals & Offers", href: "/deals" },
  { icon: Boxes, label: "Inventory", href: "/menu?tab=inventory" },
  { icon: Ticket, label: "Coupon Code", href: "/coupons" },
  { icon: Layers, label: "Cuisines", href: "/cuisines" },
];

const menuChildren = [
  { icon: UtensilsCrossed, label: "Items", href: "/menu" },
  { icon: LayoutGrid, label: "Categories", href: "/menu?tab=categories" },
  { icon: ListTree, label: "Sub-categories", href: "/menu?tab=sub-categories" },
  { icon: PlusSquare, label: "Add-ons", href: "/menu?tab=addons" },
  { icon: Gauge, label: "Max Order", href: "/menu?tab=max-order" },
];

const reportsChildren = [
  { icon: Store, label: "Restaurant report", href: "/reports/restaurant" },
  { icon: Package, label: "Item report", href: "/reports/items" },
  { icon: Award, label: "Best sellers", href: "/reports/best-sellers" },
  { icon: Boxes, label: "Inventory report", href: "/reports/inventory" },
  { icon: BarChart3, label: "Customer analytics", href: "/reports/customers" },
];

const usersChildren = [
  { icon: UserCircle, label: "Customers", href: "/users/customers" },
  { icon: Crown, label: "Restaurant owners", href: "/users/restaurant-owners" },
];

const managementItems = [
  { icon: Store, label: "My Restaurant", href: "/restaurant-settings" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const { role } = useAuth();
  const { restaurantId } = useActiveRestaurant();
  const [restaurantName, setRestaurantName] = useState("Royal Restaurant");
  const [ordersOpen, setOrdersOpen] = useState(
    location.pathname === "/orders" || location.pathname.startsWith("/orders/")
  );
  const [menuOpen, setMenuOpen] = useState(location.pathname === "/menu");
  const [reportsOpen, setReportsOpen] = useState(location.pathname.startsWith("/reports"));
  const [usersOpen, setUsersOpen] = useState(location.pathname.startsWith("/users"));

  useEffect(() => {
    if (location.pathname === "/menu") setMenuOpen(true);
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname.startsWith("/reports")) setReportsOpen(true);
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname.startsWith("/users")) setUsersOpen(true);
  }, [location.pathname]);

  const menuGroupActive = location.pathname === "/menu";

  useEffect(() => {
    if (restaurantId) {
      supabase
        .from("restaurants")
        .select("name")
        .eq("id", restaurantId)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.name) setRestaurantName(data.name);
        });
    }
  }, [restaurantId]);

  const managementForRole =
    role === "super_admin"
      ? managementItems.filter((i) => i.href !== "/restaurant-settings")
      : managementItems;

  const finalManagement =
    role === "super_admin"
      ? [
          { icon: Store, label: "Restaurants", href: "/restaurants" },
          { icon: Wallet, label: "Earnings", href: "/earnings" },
          ...managementForRole
        ]
      : managementItems;

  function hrefIsActive(href: string) {
    const [path, qs] = href.split("?");
    if (location.pathname !== path) return false;
    if (!qs) {
      if (path === "/menu") {
        const tab = new URLSearchParams(location.search).get("tab");
        return !tab || tab === "items";
      }
      return true;
    }
    const want = new URLSearchParams(qs);
    const have = new URLSearchParams(location.search);
    for (const [k, v] of want.entries()) {
      if (have.get(k) !== v) return false;
    }
    return true;
  }

  const NavItem = ({
    icon: Icon,
    label,
    href,
    indent,
  }: {
    icon: any;
    label: string;
    href: string;
    indent?: boolean;
  }) => {
    const isActive = hrefIsActive(href);
    const content = (
      <Link
        to={href}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
          "hover:bg-sidebar-accent",
          isActive && "bg-sidebar-accent text-sidebar-primary",
          indent && !collapsed && "pl-9 py-2"
        )}
      >
        <Icon className={cn("h-5 w-5 flex-shrink-0", isActive && "text-sidebar-primary")} />
        {!collapsed && (
          <span className={cn("text-sm font-medium", isActive && "text-sidebar-primary")}>
            {label}
          </span>
        )}
      </Link>
    );
    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right" className="ml-2">
            {label}
          </TooltipContent>
        </Tooltip>
      );
    }
    return content;
  };

  const ordersGroupActive =
    location.pathname === "/orders" || location.pathname.startsWith("/orders/");

  const reportsGroupActive = location.pathname.startsWith("/reports");

  const usersGroupActive = location.pathname.startsWith("/users");

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-300 z-40",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header with Toggle at Top */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
              <LogoIcon className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg truncate">{restaurantName}</span>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center mx-auto">
            <LogoIcon className="h-5 w-5 text-primary-foreground" />
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent flex-shrink-0"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto custom-scrollbar">
        <div className="space-y-1">
          <NavItem icon={LayoutDashboard} label="Dashboard" href="/" />

          {collapsed ? (
            <>
              {usersChildren.map((item) => (
                <NavItem key={item.href} {...item} />
              ))}
            </>
          ) : (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setUsersOpen((v) => !v)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 hover:bg-sidebar-accent",
                  usersGroupActive && "bg-sidebar-accent/50 text-sidebar-primary"
                )}
              >
                <Users
                  className={cn("h-5 w-5 flex-shrink-0", usersGroupActive && "text-sidebar-primary")}
                />
                <span className="text-sm font-medium flex-1 text-left">Users</span>
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", usersOpen && "rotate-180")}
                />
              </button>
              {usersOpen && (
                <div className="space-y-1">
                  {usersChildren.map((item) => (
                    <NavItem key={item.href} {...item} indent />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Orders group */}
          {collapsed ? (
            <NavItem icon={ClipboardList} label="Orders" href="/orders" />
          ) : (
            <>
              <button
                onClick={() => setOrdersOpen((v) => !v)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 hover:bg-sidebar-accent",
                  ordersGroupActive && "bg-sidebar-accent/50 text-sidebar-primary"
                )}
              >
                <ClipboardList
                  className={cn(
                    "h-5 w-5 flex-shrink-0",
                    ordersGroupActive && "text-sidebar-primary"
                  )}
                />
                <span className="text-sm font-medium flex-1 text-left">Orders</span>
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", ordersOpen && "rotate-180")}
                />
              </button>
              {ordersOpen && (
                <div className="space-y-1">
                  <NavItem icon={ClipboardList} label="All orders" href="/orders" indent />
                  {ordersChildren.map((c) => (
                    <NavItem key={c.href} {...c} indent />
                  ))}
                </div>
              )}
            </>
          )}

          {collapsed ? (
            <>
              {menuChildren.map((item) => (
                <NavItem key={item.href} {...item} />
              ))}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 hover:bg-sidebar-accent",
                  menuGroupActive && "bg-sidebar-accent/50 text-sidebar-primary",
                )}
              >
                <UtensilsCrossed
                  className={cn("h-5 w-5 flex-shrink-0", menuGroupActive && "text-sidebar-primary")}
                />
                <span className="text-sm font-medium flex-1 text-left">Menu</span>
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", menuOpen && "rotate-180")}
                />
              </button>
              {menuOpen && (
                <div className="space-y-1">
                  {menuChildren.map((item) => (
                    <NavItem key={item.href} {...item} indent />
                  ))}
                </div>
              )}
            </>
          )}

          {navigationItems
            .filter((i) => i.href !== "/")
            .map((item) => (
              <NavItem key={item.href} {...item} />
            ))}
        </div>

        {collapsed ? (
          <>
            {reportsChildren.map((item) => (
              <NavItem key={item.href} {...item} />
            ))}
          </>
        ) : (
          <div className="pt-4 mt-4 border-t border-sidebar-border">
            <button
              type="button"
              onClick={() => setReportsOpen((v) => !v)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 hover:bg-sidebar-accent",
                reportsGroupActive && "bg-sidebar-accent/50 text-sidebar-primary"
              )}
            >
              <FileBarChart
                className={cn("h-5 w-5 flex-shrink-0", reportsGroupActive && "text-sidebar-primary")}
              />
              <span className="text-sm font-medium flex-1 text-left">Reports</span>
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", reportsOpen && "rotate-180")}
              />
            </button>
            {reportsOpen && (
              <div className="space-y-1">
                {reportsChildren.map((item) => (
                  <NavItem key={item.href} {...item} indent />
                ))}
              </div>
            )}
          </div>
        )}

        {!collapsed && (
          <div className="pt-4 mt-4 border-t border-sidebar-border">
            <p className="px-3 text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider mb-2">
              Management
            </p>
            {finalManagement.map((item) => (
              <NavItem key={item.href} {...item} />
            ))}
          </div>
        )}
      </nav>
    </aside>
  );
}
