import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { getApiBase } from "@/lib/apiBase";
import { getToken } from "@/lib/authStorage";
import {
  User,
  Mail,
  Save,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  Shield,
  Camera,
} from "lucide-react";
import { cn } from "@/lib/utils";

function roleLabel(role: string | null | undefined) {
  if (!role) return "User";
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function Profile() {
  const { user, profile, role, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [avatarData, setAvatarData] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setAvatarData(profile.avatar_url || "");
    }
  }, [profile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: "Please select an image smaller than 2MB.",
      });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setAvatarData(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          avatar_url: avatarData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      toast({ title: "Profile updated", description: "Your details were saved." });
      await refreshProfile();
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({
        variant: "destructive",
        title: "Password too short",
        description: "New password must be at least 8 characters.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Passwords do not match",
        description: "Confirm password must match the new password.",
      });
      return;
    }

    const token = getToken();
    if (!token) {
      toast({ variant: "destructive", title: "Not signed in" });
      return;
    }

    setPasswordBusy(true);
    try {
      const res = await fetch(`${getApiBase()}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; success?: boolean };
      if (!res.ok) throw new Error(data.error || "Failed to change password");

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Password updated", description: "Use your new password next time you sign in." });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Could not change password",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPasswordBusy(false);
    }
  };

  const initials =
    (fullName.trim() || user?.email || "U")
      .split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";

  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-fade-in">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Profile</h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Update your personal details and account security.
        </p>
      </div>

      {/* Identity header */}
      <Card className="overflow-hidden border-border/70">
        <div
          className="relative h-28 sm:h-32"
          style={{
            background:
              "linear-gradient(135deg, hsl(var(--primary) / 0.9) 0%, hsl(18 92% 42%) 55%, hsl(217 28% 17%) 100%)",
          }}
        >
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 30%, hsl(0 0% 100% / 0.35), transparent 45%)",
            }}
          />
        </div>
        <CardContent className="relative px-6 pb-6 pt-0 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end">
              <div className="relative -mt-12 sm:-mt-14">
                <Avatar className="h-24 w-24 border-4 border-background shadow-lg ring-2 ring-primary/20 sm:h-28 sm:w-28">
                  <AvatarImage src={avatarData || undefined} alt={fullName} className="object-cover" />
                  <AvatarFallback className="bg-primary text-2xl font-semibold text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute bottom-1 right-1 h-9 w-9 rounded-full border-2 border-background shadow-md"
                  onClick={() => fileInputRef.current?.click()}
                  title="Change photo"
                >
                  <Camera className="h-4 w-4" />
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileChange}
                />
              </div>
              <div className="pb-1 text-center sm:text-left">
                <h2 className="text-xl font-bold tracking-tight">{fullName || "Your name"}</h2>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <Badge variant="secondary" className="gap-1 font-medium">
                    <Shield className="h-3 w-3" />
                    {roleLabel(role)}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal info */}
      <Card className="border-border/70">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5 text-primary" />
            Personal information
          </CardTitle>
          <CardDescription>How your name appears across the dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              placeholder="Enter your full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              Email
            </Label>
            <Input id="email" value={user?.email || ""} disabled className="h-11 bg-muted/40" />
            <p className="text-xs text-muted-foreground">Email is tied to your login and cannot be changed here.</p>
          </div>

          <Separator />

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={loading}
              onClick={() => {
                setFullName(profile?.full_name || "");
                setAvatarData(profile?.avatar_url || "");
              }}
            >
              Reset
            </Button>
            <Button type="button" className="h-11 min-w-[140px] gap-2" disabled={loading} onClick={() => void handleSave()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {loading ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Password */}
      <Card className="border-border/70">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="h-5 w-5 text-primary" />
            Change password
          </CardTitle>
          <CardDescription>Use a strong password you do not reuse elsewhere.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-5">
            <PasswordField
              id="currentPassword"
              label="Current password"
              value={currentPassword}
              onChange={setCurrentPassword}
              show={showCurrent}
              onToggle={() => setShowCurrent((v) => !v)}
              autoComplete="current-password"
            />
            <PasswordField
              id="newPassword"
              label="New password"
              value={newPassword}
              onChange={setNewPassword}
              show={showNew}
              onToggle={() => setShowNew((v) => !v)}
              autoComplete="new-password"
              hint="At least 8 characters"
            />
            <PasswordField
              id="confirmPassword"
              label="Confirm new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showConfirm}
              onToggle={() => setShowConfirm((v) => !v)}
              autoComplete="new-password"
            />

            <div className="flex justify-end pt-1">
              <Button type="submit" className="h-11 min-w-[160px] gap-2" disabled={passwordBusy}>
                {passwordBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                {passwordBusy ? "Updating…" : "Update password"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete: string;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required
          className="h-11 pr-11"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-lg")}
          onClick={onToggle}
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
        </Button>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
