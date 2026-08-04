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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  const { role, profile, user } = useAuth();
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
          ...managementForRole,
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
          "group relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
          "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isActive &&
            "bg-sidebar-primary/15 text-sidebar-accent-foreground shadow-[inset_3px_0_0_0_hsl(var(--sidebar-primary))]",
          indent && !collapsed && "pl-9 py-2"
        )}
      >
        <Icon
          className={cn(
            "h-[18px] w-[18px] flex-shrink-0 transition-colors",
            isActive ? "text-sidebar-primary" : "text-sidebar-foreground/55 group-hover:text-sidebar-foreground"
          )}
        />
        {!collapsed && (
          <span className={cn("text-sm font-medium tracking-tight", isActive && "text-sidebar-accent-foreground")}>
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

  const GroupButton = ({
    open,
    onToggleOpen,
    active,
    icon: Icon,
    label,
  }: {
    open: boolean;
    onToggleOpen: () => void;
    active: boolean;
    icon: any;
    label: string;
  }) => (
    <button
      type="button"
      onClick={onToggleOpen}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
        "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        active && !open && "bg-sidebar-accent text-sidebar-accent-foreground"
      )}
    >
      <Icon
        className={cn(
          "h-[18px] w-[18px] flex-shrink-0",
          active ? "text-sidebar-primary" : "text-sidebar-foreground/55"
        )}
      />
      <span className="text-sm font-medium tracking-tight flex-1 text-left">{label}</span>
      <ChevronDown
        className={cn(
          "h-4 w-4 text-sidebar-foreground/40 transition-transform duration-200",
          open && "rotate-180"
        )}
      />
    </button>
  );

  const ordersGroupActive =
    location.pathname === "/orders" || location.pathname.startsWith("/orders/");
  const reportsGroupActive = location.pathname.startsWith("/reports");
  const usersGroupActive = location.pathname.startsWith("/users");

  const displayName = profile?.full_name || user?.email || "User";
  const roleLabel =
    role === "super_admin" ? "Admin" : role ? role.replace("_", " ") : "User";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-300 z-40",
        "border-r border-sidebar-border",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(ellipse 80% 120% at 0% 0%, hsl(168 65% 48% / 0.22), transparent 55%)",
          }}
        />
        <div className="relative h-16 flex items-center justify-between px-4">
          {!collapsed && (
            <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
              <div className="w-9 h-9 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0 shadow-lg shadow-black/20">
                <LogoIcon className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-[15px] tracking-tight text-sidebar-accent-foreground truncate">
                {restaurantName}
              </span>
            </div>
          )}
          {collapsed && (
            <div className="w-9 h-9 rounded-lg gradient-primary flex items-center justify-center mx-auto shadow-lg shadow-black/20">
              <LogoIcon className="h-5 w-5 text-primary-foreground" />
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className={cn(
              "h-8 w-8 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex-shrink-0",
              collapsed && "hidden"
            )}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      {collapsed && (
        <div className="px-2 pb-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-8 w-8 w-full text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <nav className="flex-1 py-3 px-2.5 space-y-1 overflow-y-auto custom-scrollbar">
        <div className="space-y-0.5">
          <NavItem icon={LayoutDashboard} label="Dashboard" href="/" />

          {collapsed ? (
            usersChildren.map((item) => <NavItem key={item.href} {...item} />)
          ) : (
            <div className="space-y-0.5">
              <GroupButton
                open={usersOpen}
                onToggleOpen={() => setUsersOpen((v) => !v)}
                active={usersGroupActive}
                icon={Users}
                label="Users"
              />
              {usersOpen && (
                <div className="space-y-0.5">
                  {usersChildren.map((item) => (
                    <NavItem key={item.href} {...item} indent />
                  ))}
                </div>
              )}
            </div>
          )}

          {collapsed ? (
            <NavItem icon={ClipboardList} label="Orders" href="/orders" />
          ) : (
            <>
              <GroupButton
                open={ordersOpen}
                onToggleOpen={() => setOrdersOpen((v) => !v)}
                active={ordersGroupActive}
                icon={ClipboardList}
                label="Orders"
              />
              {ordersOpen && (
                <div className="space-y-0.5">
                  <NavItem icon={ClipboardList} label="All orders" href="/orders" indent />
                  {ordersChildren.map((c) => (
                    <NavItem key={c.href} {...c} indent />
                  ))}
                </div>
              )}
            </>
          )}

          {collapsed ? (
            menuChildren.map((item) => <NavItem key={item.href} {...item} />)
          ) : (
            <>
              <GroupButton
                open={menuOpen}
                onToggleOpen={() => setMenuOpen((v) => !v)}
                active={menuGroupActive}
                icon={UtensilsCrossed}
                label="Menu"
              />
              {menuOpen && (
                <div className="space-y-0.5">
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
          reportsChildren.map((item) => <NavItem key={item.href} {...item} />)
        ) : (
          <div className="pt-4 mt-3 border-t border-sidebar-border">
            <GroupButton
              open={reportsOpen}
              onToggleOpen={() => setReportsOpen((v) => !v)}
              active={reportsGroupActive}
              icon={FileBarChart}
              label="Reports"
            />
            {reportsOpen && (
              <div className="space-y-0.5 mt-0.5">
                {reportsChildren.map((item) => (
                  <NavItem key={item.href} {...item} indent />
                ))}
              </div>
            )}
          </div>
        )}

        {!collapsed && (
          <div className="pt-4 mt-3 border-t border-sidebar-border space-y-0.5">
            <p className="px-3 text-[10px] font-bold text-sidebar-foreground/35 uppercase tracking-[0.16em] mb-2">
              Management
            </p>
            {finalManagement.map((item) => (
              <NavItem key={item.href} {...item} />
            ))}
          </div>
        )}
      </nav>

      {!collapsed && (
        <div className="p-3 border-t border-sidebar-border">
          <div className="rounded-xl bg-sidebar-accent/80 border border-sidebar-border p-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 ring-2 ring-sidebar-primary/30">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-sm font-semibold">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-sidebar-accent-foreground truncate leading-tight">
                  {displayName}
                </p>
                <p className="text-xs text-sidebar-foreground/50 capitalize">({roleLabel})</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {collapsed && (
        <div className="p-2 border-t border-sidebar-border flex justify-center">
          <Avatar className="h-9 w-9">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
              {initial}
            </AvatarFallback>
          </Avatar>
        </div>
      )}
    </aside>
  );
}
