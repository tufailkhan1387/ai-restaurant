import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Users,
  UserPlus,
  Search,
  Store,
  Mail,
  Trash2,
  ShieldCheck,
  Shield,
  ChefHat,
  Receipt,
  Loader2,
  Check,
  Lock,
  User,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useActiveRestaurant } from "@/hooks/useActiveRestaurant";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/i18n/formatters";
import { getApiBase } from "@/lib/apiBase";
import { getToken } from "@/lib/authStorage";
import { cn } from "@/lib/utils";

interface TeamMemberRow {
  id: string; // restaurant_members.id
  restaurant_id: string;
  restaurant_name: string;
  user_id: string;
  member_role: string;
  email: string;
  full_name: string | null;
  created_at: string;
}

interface RestaurantOption {
  id: string;
  name: string;
}

export default function TeamMembersPage() {
  const { t } = useTranslation(["users", "common", "settings"]);
  const { toast } = useToast();
  const { role: authRole } = useAuth();
  const isSuperAdmin = authRole === "super_admin";
  const { restaurantId: activeRestaurantId } = useActiveRestaurant();

  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRestaurantFilter, setSelectedRestaurantFilter] = useState<string>("all");

  // Add Member Modal State
  const [openDialog, setOpenDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("manager");
  const [targetRestaurantId, setTargetRestaurantId] = useState<string>("");

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch restaurant members
      let membersQuery = supabase
        .from("restaurant_members")
        .select("id, restaurant_id, user_id, member_role, created_at")
        .order("created_at", { ascending: false });

      if (activeRestaurantId) {
        membersQuery = membersQuery.eq("restaurant_id", activeRestaurantId);
      } else if (!isSuperAdmin) {
        membersQuery = membersQuery.eq("restaurant_id", "00000000-0000-0000-0000-000000000000");
      }

      const { data: mData, error: mErr } = await membersQuery;
      if (mErr) throw mErr;
      const mRows = (mData as any[]) || [];

      // 2. Fetch profiles, restaurants, and user_roles in parallel
      const userIds = [...new Set(mRows.map((m) => m.user_id).filter(Boolean))];

      const [{ data: pData }, { data: rData }, { data: rolesData }] = await Promise.all([
        userIds.length > 0
          ? supabase.from("profiles").select("id, email, full_name").in("id", userIds)
          : { data: [] },
        supabase.from("restaurants").select("id, name").order("name"),
        userIds.length > 0
          ? supabase.from("user_roles").select("user_id, role").in("user_id", userIds)
          : { data: [] },
      ]);

      const superAdminUserIds = new Set(
        ((rolesData as any[]) || [])
          .filter((r) => r.role === "super_admin")
          .map((r) => r.user_id)
      );

      const profileMap = Object.fromEntries(
        ((pData as any[]) || []).map((p) => [p.id, { email: p.email, full_name: p.full_name }])
      );

      const allRests = ((rData as any[]) || []).map((r) => ({ id: r.id, name: r.name }));
      setRestaurants(allRests);

      const restMap = Object.fromEntries(allRests.map((r) => [r.id, r.name]));

      const combined: TeamMemberRow[] = mRows
        .filter((m) => !superAdminUserIds.has(m.user_id))
        .map((m) => {
          const prof = profileMap[m.user_id] || { email: "", full_name: null };
          return {
            id: m.id,
            restaurant_id: m.restaurant_id,
            restaurant_name: restMap[m.restaurant_id] || "Restaurant",
            user_id: m.user_id,
            member_role: m.member_role || "staff",
            email: prof.email,
            full_name: prof.full_name,
            created_at: m.created_at,
          };
        });

      setMembers(combined);

      // Default target restaurant
      if (activeRestaurantId) {
        setTargetRestaurantId(activeRestaurantId);
      } else if (allRests.length > 0) {
        setTargetRestaurantId(allRests[0].id);
      }
    } catch (err: any) {
      console.error("Failed to load team members:", err);
      toast({ variant: "destructive", title: t("common:error", "Error"), description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeRestaurantId]);

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast({
        variant: "destructive",
        title: t("common:validationError", "Validation Error"),
        description: t("settings:emailPasswordRequired", "Email and password are required."),
      });
      return;
    }

    const restIdToUse = activeRestaurantId || targetRestaurantId;
    if (!restIdToUse) {
      toast({
        variant: "destructive",
        title: t("common:validationError", "Validation Error"),
        description: "No active restaurant found. Please make sure a restaurant is selected.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const token = getToken();
      const res = await fetch(`${getApiBase()}/api/auth/create-team-member`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          email: email.trim(),
          password: password.trim(),
          full_name: fullName.trim(),
          role,
          restaurant_id: restIdToUse,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to add team member");
      }

      toast({
        title: "✅ Team Member Added",
        description: `${fullName || email} is now linked to the restaurant with ${role} permissions.`,
      });

      setOpenDialog(false);
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("manager");
      loadData();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: t("common:failed", "Failed"),
        description: err.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMember = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name || "this member"} from the restaurant team?`)) {
      return;
    }

    try {
      const token = getToken();
      const res = await fetch(`${getApiBase()}/api/auth/delete-team-member/${id}`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to remove member");
      }

      toast({ title: "Team Member Removed" });
      loadData();
    } catch (err: any) {
      toast({ variant: "destructive", title: t("common:error", "Error"), description: err.message });
    }
  };

  const handleUpdateRole = async (membershipId: string, newRole: string) => {
    try {
      const token = getToken();
      const res = await fetch(`${getApiBase()}/api/auth/update-team-member-role`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id: membershipId, member_role: newRole }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to update role");
      }

      toast({ title: "Role updated successfully" });
      loadData();
    } catch (err: any) {
      toast({ variant: "destructive", title: t("common:error", "Error"), description: err.message });
    }
  };

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const matchSearch =
        !searchQuery.trim() ||
        m.restaurant_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.full_name && m.full_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        m.member_role.toLowerCase().includes(searchQuery.toLowerCase());

      const matchRest =
        selectedRestaurantFilter === "all" || m.restaurant_id === selectedRestaurantFilter;

      return matchSearch && matchRest;
    });
  }, [members, searchQuery, selectedRestaurantFilter]);

  const getRoleBadge = (roleStr: string) => {
    const r = roleStr.toLowerCase();
    if (r === "owner") {
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 gap-1">
          <ShieldCheck className="h-3 w-3" /> Owner
        </Badge>
      );
    }
    if (r === "admin") {
      return (
        <Badge className="bg-primary/10 text-primary border-primary/30 gap-1">
          <Shield className="h-3 w-3" /> Admin
        </Badge>
      );
    }
    if (r === "kitchen" || r === "chef") {
      return (
        <Badge className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 gap-1">
          <ChefHat className="h-3 w-3" /> Kitchen Staff
        </Badge>
      );
    }
    if (r === "cashier") {
      return (
        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 gap-1">
          <Receipt className="h-3 w-3" /> Cashier
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="capitalize">
        {r || "Staff"}
      </Badge>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12 max-w-7xl mx-auto">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground flex items-center gap-3">
            <Users className="h-7 w-7 text-primary" />
            {t("users:teamMembersTitle", "Team Members")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t(
              "users:teamMembersSubtitle",
              "Manage restaurant staff and team members with access to edit restaurant menu, orders, inventory and settings."
            )}
          </p>
        </div>

        {/* Add Member Dialog */}
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground gap-2 shadow-sm rounded-xl font-semibold">
              <UserPlus className="h-4 w-4" />
              {t("users:addTeamMember", "Add Team Member")}
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <UserPlus className="h-5 w-5 text-primary" />
                {t("users:addTeamMember", "Add Team Member")}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Add staff members to collaborate on restaurant operations.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateMember} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="mem-name" className="text-xs font-semibold">
                  {t("common:name", "Full Name")}
                </Label>
                <Input
                  id="mem-name"
                  placeholder="e.g. John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mem-email" className="text-xs font-semibold">
                  {t("common:email", "Email Address")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="mem-email"
                  type="email"
                  placeholder="john@restaurant.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mem-pass" className="text-xs font-semibold">
                  {t("auth:password", "Password")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="mem-pass"
                  type="password"
                  placeholder="Minimum 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="rounded-xl text-xs"
                />
              </div>

              {/* Assign to Restaurant (Visible for Super Admin when not pre-scoped) */}
              {isSuperAdmin && !activeRestaurantId && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    {t("users:restaurant", "Assign To Restaurant")} <span className="text-destructive">*</span>
                  </Label>
                  <Select value={targetRestaurantId} onValueChange={setTargetRestaurantId}>
                    <SelectTrigger className="rounded-xl text-xs">
                      <SelectValue placeholder="Select a restaurant" />
                    </SelectTrigger>
                    <SelectContent>
                      {restaurants.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  {t("users:role", "Member Role & Permissions")}
                </Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="rounded-xl text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Manager (Operations, Menu, Orders & Inventory)</SelectItem>
                    <SelectItem value="kitchen">Kitchen Staff (Order Fulfillment)</SelectItem>
                    <SelectItem value="cashier">Cashier (Orders & Receipts)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground pt-1">
                  Team members will have full rights to manage and modify this restaurant's operations.
                </p>
              </div>

              <DialogFooter className="gap-2 pt-3">
                <Button variant="outline" type="button" onClick={() => setOpenDialog(false)}>
                  {t("common:cancel", "Cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="gradient-primary text-primary-foreground gap-2 min-w-[120px]"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {submitting ? "Saving..." : "Add Member"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-card p-4 rounded-2xl border border-border/70 shadow-xs flex flex-col sm:flex-row items-center gap-3 justify-between">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("users:searchTeamPlaceholder", "Search by name, email, or role...")}
            className="pl-9 rounded-xl text-xs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Multi-restaurant filter for Super Admin in global mode */}
        {isSuperAdmin && !activeRestaurantId && (
          <div className="w-full sm:w-64">
            <Select value={selectedRestaurantFilter} onValueChange={setSelectedRestaurantFilter}>
              <SelectTrigger className="rounded-xl text-xs h-9.5">
                <SelectValue placeholder="All Restaurants" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Restaurants ({restaurants.length})</SelectItem>
                {restaurants.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Table Card */}
      <Card className="border border-border/70 bg-card rounded-2xl shadow-xs overflow-hidden">
        <CardHeader className="border-b border-border/40 py-4 px-6 bg-muted/10 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {t("users:activeTeamMembers", "Active Team Members")} ({filteredMembers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 flex items-center justify-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span>Loading team members...</span>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground space-y-2">
              <Users className="h-10 w-10 mx-auto text-muted-foreground/30" />
              <p className="font-semibold text-sm">No team members found</p>
              <p className="text-xs">Click "Add Team Member" above to grant staff access.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30 border-b border-border/50">
                    <TableHead className="py-3.5 px-6 font-bold text-xs uppercase tracking-wider text-muted-foreground">
                      Member
                    </TableHead>
                    <TableHead className="py-3.5 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground">
                      Restaurant
                    </TableHead>
                    <TableHead className="py-3.5 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground">
                      Role & Permissions
                    </TableHead>
                    <TableHead className="py-3.5 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground">
                      Date Added
                    </TableHead>
                    <TableHead className="py-3.5 px-6 text-right font-bold text-xs uppercase tracking-wider text-muted-foreground">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/40">
                  {filteredMembers.map((row) => (
                    <TableRow key={row.id} className="hover:bg-muted/20 transition-colors">
                      {/* Member Info */}
                      <TableCell className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                            {(row.full_name || row.email || "U").charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-xs text-foreground truncate">
                              {row.full_name || "Team Member"}
                            </p>
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                              <Mail className="h-3 w-3 shrink-0" />
                              {row.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      {/* Restaurant */}
                      <TableCell className="py-4 px-4">
                        <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                          <Store className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span>{row.restaurant_name}</span>
                        </div>
                      </TableCell>

                      {/* Role & Quick Switch */}
                      <TableCell className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          {getRoleBadge(row.member_role)}
                          {row.member_role !== "owner" && row.member_role !== "admin" && (
                            <Select
                              defaultValue={row.member_role}
                              onValueChange={(v) => handleUpdateRole(row.id, v)}
                            >
                              <SelectTrigger className="h-6 text-[10px] w-24 border-border/50 bg-background/50">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="manager">Manager</SelectItem>
                                <SelectItem value="kitchen">Kitchen</SelectItem>
                                <SelectItem value="cashier">Cashier</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </TableCell>

                      {/* Created At */}
                      <TableCell className="py-4 px-4 text-xs text-muted-foreground">
                        {formatDate(row.created_at, { month: "short", day: "numeric", year: "numeric" })}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="py-4 px-6 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-lg"
                          title="Remove Team Member"
                          onClick={() => handleDeleteMember(row.id, row.full_name || row.email)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
