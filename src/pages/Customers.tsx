import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Search, Mail, Phone, Building2, TrendingUp, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export default function Customers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newNotes, setNewNotes] = useState("");

  function resetAddForm() {
    setNewFullName("");
    setNewEmail("");
    setNewPhone("");
    setNewCompany("");
    setNewNotes("");
  }

  const addCustomer = useMutation({
    mutationFn: async () => {
      const phone = newPhone.trim();
      if (!phone) {
        throw new Error("Phone number is required.");
      }
      const { error } = await supabase.from("customers").insert({
        phone_number: phone,
        full_name: newFullName.trim() || null,
        email: newEmail.trim() || null,
        company: newCompany.trim() || null,
        notes: newNotes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "Customer added" });
      setAddOpen(false);
      resetAddForm();
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Could not add customer",
        description: err.message,
      });
    },
  });

  // Fetch customers from the customers table
  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch won leads (converted leads) as potential customers
  const { data: wonLeads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ["won-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .in("status", ["qualified", "proposal", "negotiation", "won"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Combine: direct customers + qualified/won leads (potential customers)
  const wonOnly = wonLeads.filter((l) => l.status === "won");
  const allCustomers = [
    ...customers.map((c) => ({
      id: c.id,
      full_name: c.full_name || "Unknown",
      email: c.email,
      phone_number: c.phone_number,
      company: c.company,
      source: "direct" as const,
      status: "won" as const,
      created_at: c.created_at,
    })),
    ...wonLeads.map((l) => ({
      id: l.id,
      full_name: l.full_name || "Unknown",
      email: l.email,
      phone_number: l.phone_number,
      company: l.company,
      source: l.status === "won" ? ("converted_lead" as const) : ("potential" as const),
      status: (l.status || "qualified") as string,
      created_at: l.created_at,
    })),
  ];

  const filteredCustomers = allCustomers.filter((customer) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      customer.full_name?.toLowerCase().includes(query) ||
      customer.email?.toLowerCase().includes(query) ||
      customer.phone_number?.toLowerCase().includes(query) ||
      customer.company?.toLowerCase().includes(query)
    );
  });

  const isLoading = customersLoading || leadsLoading;
  const convertedCount = wonOnly.length;
  const potentialCount = wonLeads.length - wonOnly.length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Customers</h1>
          <p className="text-muted-foreground">View customers and converted leads</p>
        </div>
        <Button type="button" onClick={() => setAddOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Add customer
        </Button>
      </div>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) resetAddForm();
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add customer</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="cust-phone">Phone number *</Label>
              <Input
                id="cust-phone"
                placeholder="+1 555 0100"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                autoComplete="tel"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cust-name">Full name</Label>
              <Input
                id="cust-name"
                placeholder="Jane Doe"
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cust-email">Email</Label>
              <Input
                id="cust-email"
                type="email"
                placeholder="jane@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cust-company">Company</Label>
              <Input
                id="cust-company"
                placeholder="Acme Inc."
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cust-notes">Notes</Label>
              <Textarea
                id="cust-notes"
                placeholder="Optional notes…"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAddOpen(false);
                resetAddForm();
              }}
            >
              Cancel
            </Button>
            <Button type="button" disabled={addCustomer.isPending} onClick={() => addCustomer.mutate()}>
              {addCustomer.isPending ? "Saving…" : "Save customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Customers</p>
                <p className="text-2xl font-bold">{allCustomers.length}</p>
              </div>
              <Users className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Direct Customers</p>
                <p className="text-2xl font-bold">{customers.length}</p>
              </div>
              <Users className="h-8 w-8 text-status-available" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Converted Leads</p>
                <p className="text-2xl font-bold">{convertedCount}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-status-on-call" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Potential (qualified)</p>
                <p className="text-2xl font-bold">{potentialCount}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Customers Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Customers</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search customers..."
                className="pl-10 w-[300px]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No customers found</p>
              <p className="text-sm mt-1">Add a customer with the button above, or convert leads to see them here.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Added</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer) => (
                  <TableRow key={customer.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {customer.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2) || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{customer.full_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {customer.email && (
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            {customer.email}
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {customer.phone_number || "—"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {customer.company ? (
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {customer.company}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={customer.source === "converted_lead" ? "default" : "secondary"}>
                        {customer.source === "converted_lead"
                          ? "Converted Lead"
                          : customer.source === "potential"
                            ? `Potential (${customer.status})`
                            : "Direct"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {customer.created_at 
                        ? format(new Date(customer.created_at), "MMM d, yyyy")
                        : "-"
                      }
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
