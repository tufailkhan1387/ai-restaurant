import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, LogOut, User } from "lucide-react";
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

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 relative z-30">
      <div className="flex items-center gap-4 flex-1 max-w-md">
        <div ref={containerRef} className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-[1]" />
          <Input
            placeholder="Search sidebar pages…"
            className="pl-10 bg-background"
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
              className="absolute left-0 right-0 top-full mt-1 max-h-72 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md z-[70]"
            >
              {results.length === 0 ? (
                <p className="px-3 py-6 text-sm text-center text-muted-foreground">No pages match your search.</p>
              ) : (
                <ul className="p-1">
                  {results.map((item) => (
                    <li key={`${item.href}-${item.label}`} role="option">
                      <button
                        type="button"
                        className={cn(
                          "w-full text-left rounded-sm px-2 py-2 text-sm outline-none",
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

      <div className="flex items-center gap-4">
        <OrderNotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <Avatar className="h-8 w-8">
                <AvatarImage key={profile?.avatar_url || "default"} src={profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                  {profile?.full_name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium">{profile?.full_name || "User"}</p>
                <p className="text-xs text-primary capitalize">Online</p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
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
