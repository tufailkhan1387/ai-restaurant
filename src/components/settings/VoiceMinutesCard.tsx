import { useCallback, useEffect, useState } from "react";
import { Clock, Loader2, PhoneCall, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getApiBase } from "@/lib/apiBase";
import { getToken } from "@/lib/authStorage";
import { BILLING_PLANS, BillingPlanId, formatPlanPrice, MINUTE_PACKS, MinutePackId } from "@/lib/billingPlans";

type MinutesPayload = {
  plan: string | null;
  included_minutes: number;
  purchased_minutes: number;
  used_minutes: number;
  total_minutes: number;
  remaining_minutes: number;
  subscription_status?: string | null;
  mode?: string;
  packs?: { id: string; minutes: number; amount_cents: number; label: string }[];
};

const PACK_ORDER: MinutePackId[] = ["m300", "m500", "m1000", "m2000"];

export function VoiceMinutesCard({ restaurantId }: { restaurantId: string }) {
  const { toast } = useToast();
  const [data, setData] = useState<MinutesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [buyOpen, setBuyOpen] = useState(false);
  const [selectedPack, setSelectedPack] = useState<MinutePackId>("m500");
  const [buying, setBuying] = useState(false);
  const [cardNumber, setCardNumber] = useState("4242424242424242");
  const [expMonth, setExpMonth] = useState("12");
  const [expYear, setExpYear] = useState(String(new Date().getFullYear() + 2));
  const [cvc, setCvc] = useState("123");

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/billing/minutes/${encodeURIComponent(restaurantId)}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load minutes");
      setData(json);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Minutes unavailable",
        description: err instanceof Error ? err.message : "Could not load voice minutes",
      });
    } finally {
      setLoading(false);
    }
  }, [restaurantId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const session = params.get("minutes_session");
    if (!session) return;

    (async () => {
      try {
        const res = await fetch(`${getApiBase()}/api/billing/minutes/claim`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ session }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not confirm purchase");
        toast({
          title: "Minutes added",
          description: `${json.purchase?.minutes?.toLocaleString?.() || ""} voice minutes credited.`,
        });
        await load();
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Purchase not confirmed",
          description: err instanceof Error ? err.message : "Try again",
        });
      } finally {
        params.delete("minutes_session");
        params.delete("minutes_canceled");
        const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
        window.history.replaceState({}, "", next);
      }
    })();
  }, [load, toast]);

  const purchase = async () => {
    setBuying(true);
    try {
      const res = await fetch(`${getApiBase()}/api/billing/minutes/purchase`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          pack: selectedPack,
          card: {
            number: cardNumber,
            exp_month: expMonth,
            exp_year: expYear,
            cvc,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Purchase failed");

      if (json.mode === "stripe" && json.checkout_url) {
        window.location.href = json.checkout_url;
        return;
      }

      setData((prev) => ({
        ...(prev || {
          plan: null,
          included_minutes: 0,
          purchased_minutes: 0,
          used_minutes: 0,
          total_minutes: 0,
          remaining_minutes: 0,
        }),
        included_minutes: json.included_minutes,
        purchased_minutes: json.purchased_minutes,
        used_minutes: json.used_minutes,
        total_minutes: json.total_minutes,
        remaining_minutes: json.remaining_minutes,
        plan: json.plan ?? prev?.plan ?? null,
      }));
      setBuyOpen(false);
      toast({
        title: "Minutes purchased",
        description: `${MINUTE_PACKS[selectedPack].minutes.toLocaleString()} minutes added to your balance.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not buy minutes",
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBuying(false);
    }
  };

  const planKey = String(data?.plan || "").toLowerCase() as BillingPlanId;
  const planName = BILLING_PLANS[planKey]?.name || (data?.plan ? String(data.plan) : "Growth (default)");
  const usedPct =
    data && data.total_minutes > 0
      ? Math.min(100, Math.round((data.used_minutes / data.total_minutes) * 100))
      : 0;

  return (
    <>
      <Card className="overflow-hidden border shadow-sm">
        <CardHeader className="border-b bg-muted/30 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <PhoneCall className="h-5 w-5 text-primary" />
                AI voice minutes
              </CardTitle>
              <CardDescription className="mt-1">
                Allowance from your subscribed plan, remaining balance, and top-up packs.
              </CardDescription>
            </div>
            <Button type="button" onClick={() => setBuyOpen(true)} disabled={loading}>
              <Plus className="h-4 w-4 mr-1.5" />
              Buy minutes
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          {loading && !data ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading minutes…
            </div>
          ) : data ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-medium">
                  {planName} plan
                </Badge>
                {data.subscription_status && (
                  <Badge variant="outline" className="capitalize">
                    {data.subscription_status}
                  </Badge>
                )}
              </div>

              <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Minutes remaining</p>
                    <p className="text-3xl font-bold tracking-tight tabular-nums">
                      {data.remaining_minutes.toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p>
                      <Clock className="inline h-3.5 w-3.5 mr-1" />
                      {data.used_minutes.toLocaleString()} used of {data.total_minutes.toLocaleString()}
                    </p>
                  </div>
                </div>
                <Progress value={usedPct} className="h-2" />
              </div>

              <div className="grid gap-3 sm:grid-cols-3 text-sm">
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground">Included in plan</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{data.included_minutes.toLocaleString()}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground">Purchased top-ups</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{data.purchased_minutes.toLocaleString()}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground">Used</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{data.used_minutes.toLocaleString()}</p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Could not load minute balance.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Buy more minutes</DialogTitle>
            <DialogDescription>
              Add extra AI receptionist minutes on top of your plan allowance.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 sm:grid-cols-2">
            {PACK_ORDER.map((id) => {
              const pack = MINUTE_PACKS[id];
              const active = selectedPack === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedPack(id)}
                  className={`rounded-xl border p-3 text-left transition ${
                    active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/40"
                  }`}
                >
                  <p className="font-semibold">{pack.minutes.toLocaleString()} min</p>
                  <p className="text-sm text-muted-foreground">{formatPlanPrice(pack.dollars)}</p>
                </button>
              );
            })}
          </div>

          {(data?.mode === "dummy" || !data?.mode) && (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Card (dummy billing)
              </p>
              <div className="space-y-2">
                <Label htmlFor="min-card">Card number</Label>
                <Input id="min-card" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="min-mm">MM</Label>
                  <Input id="min-mm" value={expMonth} onChange={(e) => setExpMonth(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="min-yy">YYYY</Label>
                  <Input id="min-yy" value={expYear} onChange={(e) => setExpYear(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="min-cvc">CVC</Label>
                  <Input id="min-cvc" value={cvc} onChange={(e) => setCvc(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBuyOpen(false)} disabled={buying}>
              Cancel
            </Button>
            <Button type="button" onClick={purchase} disabled={buying}>
              {buying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Processing…
                </>
              ) : (
                <>Pay {formatPlanPrice(MINUTE_PACKS[selectedPack].dollars)}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
