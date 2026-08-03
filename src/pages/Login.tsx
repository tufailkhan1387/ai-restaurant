import { useState } from "react";
import { Navigate } from "react-router-dom";
import { UtensilsCrossed, Eye, EyeOff, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export default function Login() {
  const { user, loading, signIn } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(220_33%_97%)]">
        <div className="flex flex-col items-center gap-3 animate-pulse">
          <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center shadow-lg shadow-primary/30">
            <UtensilsCrossed className="h-6 w-6 text-primary-foreground" />
          </div>
          <span className="text-sm font-medium text-muted-foreground">Loading…</span>
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await signIn(email, password);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[hsl(220_33%_97%)]">
      {/* Brand plane — full-bleed visual */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden p-10 xl:p-14 text-white">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(145deg, hsl(248 70% 52%) 0%, hsl(262 65% 42%) 48%, hsl(230 55% 28%) 100%)",
          }}
          aria-hidden
        />
        {/* Atmosphere layers */}
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.35) 0%, transparent 42%), radial-gradient(circle at 85% 75%, rgba(255,180,200,0.25) 0%, transparent 45%)",
          }}
          aria-hidden
        />
        <div
          className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl animate-[pulse-subtle_6s_ease-in-out_infinite]"
          aria-hidden
        />
        <div
          className="absolute -left-16 bottom-20 h-64 w-64 rounded-full bg-rose-300/20 blur-3xl animate-[pulse-subtle_8s_ease-in-out_infinite]"
          aria-hidden
        />
        {/* Soft grid texture */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
          aria-hidden
        />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg">
            <UtensilsCrossed className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Royal Restaurant</span>
        </div>

        <div className="relative z-10 max-w-md space-y-5">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-white/80">
            <Sparkles className="h-4 w-4" aria-hidden />
            AI Ordering System
          </p>
          <h1 className="text-4xl xl:text-5xl font-bold leading-[1.1] tracking-tight">
            Run your kitchen from one calm dashboard.
          </h1>
          <p className="text-base xl:text-lg text-white/75 leading-relaxed max-w-sm">
            Orders, menu, fleet, and reports — signed in and ready when you are.
          </p>
        </div>

        <p className="relative z-10 text-sm text-white/50">© {new Date().getFullYear()} Royal Restaurant</p>
      </aside>

      {/* Form panel */}
      <main className="relative flex items-center justify-center p-6 sm:p-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-60 lg:opacity-100"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% 0%, hsl(248 70% 60% / 0.08), transparent 70%)",
          }}
          aria-hidden
        />

        <div className="relative w-full max-w-[400px] animate-fade-in">
          {/* Mobile brand */}
          <div className="flex lg:hidden items-center gap-3 mb-10 justify-center">
            <div className="w-11 h-11 rounded-2xl gradient-primary flex items-center justify-center shadow-md shadow-primary/30">
              <UtensilsCrossed className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight text-foreground">Royal Restaurant</p>
              <p className="text-xs text-muted-foreground">Management Dashboard</p>
            </div>
          </div>

          <div className="mb-8 space-y-2 text-center lg:text-left">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Welcome back</h2>
            <p className="text-muted-foreground text-sm sm:text-base">
              Sign in to access your dashboard
            </p>
          </div>

          <form
            onSubmit={handleLogin}
            className={cn(
              "rounded-3xl border border-border/60 bg-card/80 backdrop-blur-sm",
              "shadow-[0_8px_40px_-12px_rgba(15,23,42,0.12)] p-6 sm:p-8 space-y-5"
            )}
          >
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground/80">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@restaurant.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground/80">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-12 pr-11"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 rounded-lg hover:bg-muted"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-12 rounded-xl text-base font-semibold shadow-md shadow-primary/25 gap-2 group"
            >
              {isSubmitting ? (
                "Signing in…"
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </>
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-8 lg:mt-10">
            Powered by AI Ordering System
          </p>
        </div>
      </main>
    </div>
  );
}
