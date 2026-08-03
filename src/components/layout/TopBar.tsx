import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, LogOut, User, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { OrderNotificationBell } from "@/components/notifications/OrderNotificationBell";
import { filterSidebarNavItems } from "@/config/sidebarNav";
import { cn } from "@/lib/utils";

export function TopBar() {
  const { user, profile, signOut, role } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = role === "super_admin";
  const listId = useId();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo(
    () => filterSidebarNavItems(query, { isSuperAdmin }),
    [query, isSuperAdmin],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const pick = useCallback(
    (href: string) => {
      navigate(href);
      close();
    },
    [navigate, close],
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const displayName = profile?.full_name || "User";

  return (
    <header className="h-16 bg-transparent grid grid-cols-[1fr_minmax(0,36rem)_1fr] items-center gap-4 px-6 relative z-30">
      <div aria-hidden className="hidden sm:block" />

      <div className="w-full col-span-2 sm:col-span-1 sm:col-start-2">
        <div ref={containerRef} className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-[1]" />
          <Input
            placeholder="Search"
            className="pl-11 h-11 rounded-full border-0 bg-muted/80 shadow-none focus-visible:ring-2 focus-visible:ring-primary/30"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
            }}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            role="combobox"
            autoComplete="off"
          />
          {open && (
            <div
              id={listId}
              role="listbox"
              className="absolute left-0 right-0 top-full mt-2 max-h-72 overflow-auto rounded-2xl border border-border/60 bg-popover text-popover-foreground shadow-lg z-[70]"
            >
              {results.length === 0 ? (
                <p className="px-3 py-6 text-sm text-center text-muted-foreground">No pages match your search.</p>
              ) : (
                <ul className="p-1.5">
                  {results.map((item) => (
                    <li key={`${item.href}-${item.label}`} role="option">
                      <button
                        type="button"
                        className={cn(
                          "w-full text-left rounded-xl px-3 py-2.5 text-sm outline-none",
                          "hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
                        )}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pick(item.href)}
                      >
                        <span className="font-medium">{item.label}</span>
                        <span className="block text-xs text-muted-foreground truncate">{item.section}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 shrink-0 col-start-3 row-start-1">
        <div className="[&_button]:rounded-full [&_button]:bg-primary/10 [&_button]:text-primary [&_button]:hover:bg-primary/15">
          <OrderNotificationBell />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2.5 h-11 rounded-full pl-1.5 pr-3 hover:bg-muted/80"
            >
              <Avatar className="h-9 w-9 ring-2 ring-rose-100">
                <AvatarImage key={profile?.avatar_url || "default"} src={profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-rose-100 text-rose-600 text-sm font-semibold">
                  {displayName.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <span className="hidden md:inline text-sm font-medium text-foreground">{displayName}</span>
              <ChevronDown className="hidden md:block h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <Link to="/profile">
              <DropdownMenuItem className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
            </Link>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
