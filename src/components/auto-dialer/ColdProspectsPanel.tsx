import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { Sparkles, Loader2, Plus, Trash2, FileSpreadsheet, Search, Globe, RotateCw, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import * as XLSX from "xlsx";

interface Prospect {
  company: string;
  website_url: string;
  phone_number: string;
  city?: string;
  notes?: string;
  client_name?: string;
}

interface Props {
  sessionId: string;
  onImported?: () => void;
}

function normalizePhone(raw: string): string {
  return (raw || "").toString().trim().replace(/[^\d+]/g, "");
}

export function ColdProspectsPanel({ sessionId, onImported }: Props) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [count, setCount] = useState<number>(25);
  const [discovering, setDiscovering] = useState(false);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [importing, setImporting] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [bulkRetrying, setBulkRetrying] = useState(false);

  // Live cold-pitch leads for this session (analysis progress)
  const { data: coldLeads, refetch: refetchCold } = useQuery({
    queryKey: ["cold-prospects-progress", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auto_dialer_leads")
        .select("id, company, client_name, phone_number, website_url, analysis_status, analysis_source, industry, recommended_services, ai_summary, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`cold-progress-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "auto_dialer_leads", filter: `session_id=eq.${sessionId}` },
        () => refetchCold(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId, refetchCold]);

  const counts = {
    total: coldLeads?.length || 0,
    ready: coldLeads?.filter((l: any) => l.analysis_status === "ready").length || 0,
    analyzing: coldLeads?.filter((l: any) => l.analysis_status === "analyzing").length || 0,
    pending: coldLeads?.filter((l: any) => l.analysis_status === "pending").length || 0,
    failed: coldLeads?.filter((l: any) => l.analysis_status === "failed").length || 0,
  };
  const progressPct = counts.total > 0 ? (counts.ready / counts.total) * 100 : 0;

  const retryOne = async (leadId: string) => {
    setRetryingId(leadId);
    try {
      await supabase
        .from("auto_dialer_leads")
        .update({ analysis_status: "pending", ai_summary: null })
        .eq("id", leadId);
      const { error } = await supabase.functions.invoke("analyze-auto-dialer-leads", {
        body: { sessionId },
      });
      if (error) throw error;
      toast({ title: "Retry triggered", description: "AI is re-analyzing this prospect." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Retry failed", description: e.message });
    } finally {
      setRetryingId(null);
      refetchCold();
    }
  };

  const retryAllFailed = async () => {
    const failedIds = (coldLeads || []).filter((l: any) => l.analysis_status === "failed").map((l: any) => l.id);
    if (failedIds.length === 0) return;
    setBulkRetrying(true);
    try {
      await supabase
        .from("auto_dialer_leads")
        .update({ analysis_status: "pending", ai_summary: null })
        .in("id", failedIds);
      const { error } = await supabase.functions.invoke("analyze-auto-dialer-leads", {
        body: { sessionId },
      });
      if (error) throw error;
      toast({ title: `Retrying ${failedIds.length} failed prospects` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Bulk retry failed", description: e.message });
    } finally {
      setBulkRetrying(false);
      refetchCold();
    }
  };

  const discover = async () => {
    if (!query.trim()) {
      toast({ variant: "destructive", title: "Enter a niche / location" });
      return;
    }
    const wanted = Math.max(1, Math.min(Number(count) || 25, 200));
    setDiscovering(true);
    setWarning(null);
    try {
      // Pull existing phones + company names so AI never returns duplicates we already have
      const { data: existing } = await supabase
        .from("auto_dialer_leads")
        .select("phone_number, company")
        .eq("session_id", sessionId);
      const existingPhones = new Set(
        (existing || []).map((e: any) => normalizePhone(e.phone_number)).filter(Boolean),
      );
      const existingCompanies = new Set(
        (existing || []).map((e: any) => (e.company || "").toLowerCase().trim()).filter(Boolean),
      );
      // Add already-staged prospects to the exclusion lists too
      for (const p of prospects) {
        if (p.phone_number) existingPhones.add(normalizePhone(p.phone_number));
        if (p.company) existingCompanies.add(p.company.toLowerCase().trim());
      }

      // Call AI in batches of 25 until we have enough new ones (or 4 batches max)
      let collected: Prospect[] = [];
      for (let batch = 0; batch < 4 && collected.length < wanted; batch++) {
        const batchSize = Math.min(25, wanted - collected.length + 5); // small overshoot for losses
        const { data, error } = await supabase.functions.invoke("discover-prospects", {
          body: {
            query,
            limit: batchSize,
            excludePhones: Array.from(existingPhones),
            excludeCompanies: Array.from(existingCompanies),
          },
        });
        if (error) throw error;
        const batchProspects = (data?.prospects || []) as Prospect[];
        if (batchProspects.length === 0) break;
        for (const p of batchProspects) {
          const normPhone = normalizePhone(p.phone_number);
          const normCompany = (p.company || "").toLowerCase().trim();
          if (!normPhone) continue;
          if (existingPhones.has(normPhone)) continue;
          if (normCompany && existingCompanies.has(normCompany)) continue;
          existingPhones.add(normPhone);
          if (normCompany) existingCompanies.add(normCompany);
          collected.push(p);
          if (collected.length >= wanted) break;
        }
      }

      if (collected.length === 0) {
        setWarning("AI did not find new candidates for this query. Try being more specific (e.g. 'dental clinics Miami FL').");
      } else if (collected.length < wanted) {
        setWarning(`Only found ${collected.length} new prospects (asked for ${wanted}). Already-known leads were skipped.`);
      }
      setProspects((prev) => [...prev, ...collected]);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Discovery failed", description: e.message });
    } finally {
      setDiscovering(false);
    }
  };

  const handleExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);
      const parsed: Prospect[] = rows
        .map((r) => ({
          company: r["Company"] || r["Business"] || r.company || "",
          website_url: r["Website"] || r["Website URL"] || r.website || r.website_url || "",
          phone_number: normalizePhone(r["Phone"] || r["Phone Number"] || r.phone || ""),
          city: r["City"] || r.city || "",
          notes: r["Notes"] || r.notes || "",
          client_name: r["Contact"] || r["Client Name"] || r.contact || "",
        }))
        .filter((p) => p.phone_number && (p.company || p.website_url));
      if (parsed.length === 0) {
        toast({ variant: "destructive", title: "No usable rows", description: "Need at least Phone + Company or Website per row." });
        return;
      }
      setProspects((prev) => [...prev, ...parsed]);
      toast({ title: `${parsed.length} prospects loaded`, description: "Review then click Import to start AI analysis." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Excel parse failed", description: err.message });
    } finally {
      e.target.value = "";
    }
  };

  const updateRow = (i: number, patch: Partial<Prospect>) => {
    setProspects((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };
  const removeRow = (i: number) => setProspects((prev) => prev.filter((_, idx) => idx !== i));
  const addBlank = () =>
    setProspects((prev) => [...prev, { company: "", website_url: "", phone_number: "" }]);

  const importProspects = async () => {
    const valid = prospects.filter((p) => normalizePhone(p.phone_number));
    if (valid.length === 0) {
      toast({ variant: "destructive", title: "No valid prospects", description: "Each row needs a phone number." });
      return;
    }
    setImporting(true);
    try {
      // Mark this session as a cold-pitch campaign
      await supabase
        .from("auto_dialer_sessions")
        .update({ campaign_type: "cold_pitch", discovery_query: query || null } as any)
        .eq("id", sessionId);

      // Dedupe against any phone numbers already in this session
      const { data: existing } = await supabase
        .from("auto_dialer_leads")
        .select("phone_number")
        .eq("session_id", sessionId);
      const existingPhones = new Set(
        (existing || []).map((e: any) => normalizePhone(e.phone_number)).filter(Boolean),
      );

      const seen = new Set<string>();
      const deduped = valid.filter((p) => {
        const norm = normalizePhone(p.phone_number);
        if (existingPhones.has(norm) || seen.has(norm)) return false;
        seen.add(norm);
        return true;
      });
      const skipped = valid.length - deduped.length;
      if (deduped.length === 0) {
        toast({
          variant: "destructive",
          title: "All prospects already exist",
          description: `${skipped} duplicate phone number${skipped === 1 ? "" : "s"} skipped.`,
        });
        setImporting(false);
        return;
      }

      const rows = deduped.map((p, idx) => ({
        session_id: sessionId,
        client_name: p.client_name || null,
        company: p.company || null,
        phone_number: normalizePhone(p.phone_number),
        website_url: p.website_url || null,
        additional_notes: [p.city, p.notes].filter(Boolean).join(" — ") || null,
        sort_order: idx,
        analysis_status: "pending",
      }));

      const { error } = await supabase.from("auto_dialer_leads").insert(rows as any);
      if (error) throw error;

      // Update total_leads
      const { count } = await supabase
        .from("auto_dialer_leads")
        .select("*", { count: "exact", head: true })
        .eq("session_id", sessionId);
      await supabase
        .from("auto_dialer_sessions")
        .update({ total_leads: count || rows.length })
        .eq("id", sessionId);

      await supabase.from("auto_dialer_events").insert({
        session_id: sessionId,
        event_type: "cold_prospects_imported",
        message: `Imported ${rows.length} cold prospects (${query ? `discovery: ${query}` : "manual"})`,
        metadata: { count: rows.length, discovery_query: query || null },
      });

      // Trigger analysis
      supabase.functions.invoke("analyze-auto-dialer-leads", { body: { sessionId } }).catch(console.error);

      toast({
        title: `${rows.length} prospects imported`,
        description: skipped > 0
          ? `AI is analyzing each website. ${skipped} duplicate phone${skipped === 1 ? "" : "s"} skipped.`
          : "AI is analyzing each website + generating tailored pitches.",
      });
      setProspects([]);
      setQuery("");
      queryClient.invalidateQueries({ queryKey: ["auto-dialer-leads", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["auto-dialer-session", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["cold-prospects-progress", sessionId] });
      refetchCold();
      onImported?.();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Import failed", description: e.message });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {counts.total > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" /> AI Analysis Progress
              </CardTitle>
              <CardDescription>
                {counts.ready} of {counts.total} prospects analyzed · live updates
              </CardDescription>
            </div>
            {counts.failed > 0 && (
              <Button variant="outline" size="sm" onClick={retryAllFailed} disabled={bulkRetrying}>
                {bulkRetrying ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RotateCw className="h-3 w-3 mr-1" />}
                Retry {counts.failed} failed
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={progressPct} />
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary"><CheckCircle2 className="h-3 w-3 mr-1" />{counts.ready} ready</Badge>
              {counts.analyzing > 0 && <Badge variant="default"><Loader2 className="h-3 w-3 mr-1 animate-spin" />{counts.analyzing} analyzing</Badge>}
              {counts.pending > 0 && <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />{counts.pending} queued</Badge>}
              {counts.failed > 0 && <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />{counts.failed} failed</Badge>}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prospect</TableHead>
                    <TableHead>Website</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>Top service</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(coldLeads || []).map((l: any) => {
                    const topService = Array.isArray(l.recommended_services) && l.recommended_services[0]
                      ? (l.recommended_services[0] as any).service
                      : null;
                    return (
                      <TableRow key={l.id}>
                        <TableCell>
                          <div className="text-xs">
                            <div className="font-medium">{l.company || l.client_name || "—"}</div>
                            <div className="text-muted-foreground font-mono">{l.phone_number}</div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate text-xs">
                          {l.website_url ? (
                            <a href={l.website_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                              {l.website_url.replace(/^https?:\/\//, "")}
                            </a>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs">{l.industry || <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-xs max-w-[160px] truncate">
                          {topService || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {l.analysis_status === "ready" && (
                            <Badge variant="secondary" className="text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Ready</Badge>
                          )}
                          {l.analysis_status === "analyzing" && (
                            <Badge className="text-xs"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Analyzing</Badge>
                          )}
                          {l.analysis_status === "pending" && (
                            <Badge variant="outline" className="text-xs"><Clock className="h-3 w-3 mr-1" />Queued</Badge>
                          )}
                          {l.analysis_status === "failed" && (
                            <div>
                              <Badge variant="destructive" className="text-xs"><AlertCircle className="h-3 w-3 mr-1" />Failed</Badge>
                              {l.ai_summary && (
                                <p className="text-[10px] text-destructive mt-1 max-w-[200px] truncate" title={l.ai_summary}>
                                  {l.ai_summary}
                                </p>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {(l.analysis_status === "failed" || l.analysis_status === "ready") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => retryOne(l.id)}
                              disabled={retryingId === l.id}
                              title="Re-run AI analysis"
                            >
                              {retryingId === l.id
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <RotateCw className="h-3 w-3" />}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" /> Cold Prospect Outreach
          </CardTitle>
          <CardDescription>
            Find or upload new prospects we've never contacted. AI analyzes each website,
            picks the most relevant QubeTech services to pitch (web redesign, app dev, AI
            integration, SaaS, branding, etc.) and tailors the call script.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="discover">
            <TabsList>
              <TabsTrigger value="discover"><Search className="h-3 w-3 mr-1" />AI Discovery</TabsTrigger>
              <TabsTrigger value="upload"><FileSpreadsheet className="h-3 w-3 mr-1" />Excel Upload</TabsTrigger>
            </TabsList>

            <TabsContent value="discover" className="mt-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_auto] gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Niche + location</Label>
                  <Input
                    placeholder="e.g. dental clinics in Miami, law firms in Houston, gyms in Dubai"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") discover(); }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">How many?</Label>
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value) || 25)}
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={discover} disabled={discovering} className="w-full sm:w-auto">
                    {discovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    <span className="ml-1">Find {count}</span>
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Tip: AI auto-skips phone numbers and companies already in this campaign so you never get duplicates. Review every row before importing — AI suggestions may include outdated phone numbers.
              </p>
              {warning && <Alert><AlertDescription>{warning}</AlertDescription></Alert>}
            </TabsContent>

            <TabsContent value="upload" className="mt-4 space-y-3">
              <Label htmlFor="cold-excel" className="cursor-pointer">
                <div className="inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-accent">
                  <FileSpreadsheet className="h-4 w-4" /> Upload Excel
                </div>
                <Input id="cold-excel" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcel} />
              </Label>
              <p className="text-xs text-muted-foreground">
                Columns: <strong>Company, Website, Phone, City, Contact (optional), Notes (optional)</strong>
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {prospects.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>{prospects.length} prospects ready to import</CardTitle>
              <CardDescription>Edit inline. Each row needs at least a phone number.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addBlank}>
                <Plus className="h-4 w-4 mr-1" /> Add row
              </Button>
              <Button onClick={importProspects} disabled={importing}>
                {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                Import & analyze
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>City / notes</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prospects.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      <Input
                        value={p.company}
                        onChange={(e) => updateRow(i, { company: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={p.website_url}
                        onChange={(e) => updateRow(i, { website_url: e.target.value })}
                        className="h-8 text-xs"
                        placeholder="https://"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={p.phone_number}
                        onChange={(e) => updateRow(i, { phone_number: e.target.value })}
                        className="h-8 text-xs font-mono"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={[p.city, p.notes].filter(Boolean).join(" — ")}
                        onChange={(e) => updateRow(i, { notes: e.target.value, city: "" })}
                        className="h-8 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRow(i)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
