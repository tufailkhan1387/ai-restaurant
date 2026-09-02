import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, LogOut, User, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { LanguageSwitcher } from "@/components/common/LanguageSwitcher";
import { filterSidebarNavItems } from "@/config/sidebarNav";
import { cn } from "@/lib/utils";

export function TopBar() {
  const { t } = useTranslation(["sidebar", "common", "auth"]);
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
    <header className="sticky top-0 z-30 h-16 border-b border-border/70 bg-background/75 backdrop-blur-xl">
      <div className="flex h-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div ref={containerRef} className="relative w-full max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-[1]" />
          <Input
            placeholder={t("sidebar:searchPlaceholder", "Search pages and sections...")}
            className="pl-10 h-10 rounded-lg border border-border/80 bg-card/80 shadow-none focus-visible:ring-2 focus-visible:ring-primary/25"
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
              className="absolute left-0 right-0 top-full mt-2 max-h-72 overflow-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-xl z-[70] animate-rise"
            >
              {results.length === 0 ? (
                <p className="px-3 py-6 text-sm text-center text-muted-foreground">{t("sidebar:noMatchingPages", "No pages match your search.")}</p>
              ) : (
                <ul className="p-1.5">
                  {results.map((item) => (
                    <li key={`${item.href}-${item.label}`} role="option">
                      <button
                        type="button"
                        className={cn(
                          "w-full text-left rounded-lg px-3 py-2.5 text-sm outline-none",
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

        <div className="flex items-center gap-2.5 shrink-0">
          <LanguageSwitcher />

          <div className="[&_button]:rounded-lg [&_button]:bg-card [&_button]:border [&_button]:border-border/80 [&_button]:text-foreground [&_button]:hover:bg-muted [&_button]:shadow-sm">
            <OrderNotificationBell />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-2.5 h-10 rounded-lg border border-border/80 bg-card/80 pl-1.5 pr-2.5 hover:bg-card"
              >
                <Avatar className="h-8 w-8 ring-2 ring-primary/15">
                  <AvatarImage key={profile?.avatar_url || "default"} src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                    {displayName.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden md:inline text-sm font-semibold text-foreground">{displayName}</span>
                <ChevronDown className="hidden md:block h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl">
              <DropdownMenuLabel>{t("sidebar:myAccount", "My Account")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <Link to="/profile">
                <DropdownMenuItem className="cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  {t("sidebar:profile", "Profile")}
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()} className="text-destructive cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                {t("sidebar:signOut", "Sign Out")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

