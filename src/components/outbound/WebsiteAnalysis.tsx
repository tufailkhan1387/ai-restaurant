import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Globe, Loader2, CheckCircle, XCircle, AlertTriangle, RefreshCw, ExternalLink } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

type WebsiteAnalysisResult = {
  id: string;
  lead_id: string | null;
  website_url: string;
  analysis_status: string;
  missing_services: string[] | null;
  recommendations: string | null;
  tech_stack: string[] | null;
  design_score: number | null;
  seo_issues: string[] | null;
  mobile_friendly: boolean | null;
  analyzed_at: string | null;
  created_at: string;
};

type Campaign = {
  id: string;
  name: string;
};

export function WebsiteAnalysis() {
  const [singleUrl, setSingleUrl] = useState("");
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const queryClient = useQueryClient();

  const { data: campaigns } = useQuery({
    queryKey: ["outbound-campaigns-analysis"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outbound_campaigns")
        .select("id, name")
        .eq("campaign_type", "website_analysis")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Campaign[];
    },
  });

  const { data: analyses, isLoading } = useQuery({
    queryKey: ["website-analyses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_analysis")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as WebsiteAnalysisResult[];
    },
  });

  const analyzeSingle = useMutation({
    mutationFn: async (url: string) => {
      setIsAnalyzing(true);
      const response = await supabase.functions.invoke("analyze-website", {
        body: { url, mode: "single" },
      });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["website-analyses"] });
      setSingleUrl("");
      toast({ title: "Analysis complete", description: "Website has been analyzed successfully" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Analysis failed", description: error.message });
    },
    onSettled: () => {
      setIsAnalyzing(false);
    },
  });

  const analyzeBatch = useMutation({
    mutationFn: async (campaignId: string) => {
      const response = await supabase.functions.invoke("analyze-website", {
        body: { campaignId, mode: "batch" },
      });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["website-analyses"] });
      toast({ 
        title: "Batch analysis started", 
        description: `Processing ${data.count || 0} websites in background` 
      });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Batch analysis failed", description: error.message });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "processing":
        return <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getScoreColor = (score: number | null) => {
    if (!score) return "bg-muted text-muted-foreground";
    if (score >= 80) return "bg-green-500/10 text-green-500";
    if (score >= 50) return "bg-yellow-500/10 text-yellow-500";
    return "bg-red-500/10 text-red-500";
  };

  return (
    <div className="space-y-6">
      {/* Single URL Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Single Website Analysis
          </CardTitle>
          <CardDescription>
            Analyze a website to identify missing services we can offer
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="https://example.com"
                value={singleUrl}
                onChange={(e) => setSingleUrl(e.target.value)}
              />
            </div>
            <Button
              onClick={() => analyzeSingle.mutate(singleUrl)}
              disabled={!singleUrl || isAnalyzing}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                "Analyze"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Batch Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Batch Website Analysis
          </CardTitle>
          <CardDescription>
            Analyze all websites from leads in a campaign
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="w-64">
              <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                <SelectTrigger>
                  <SelectValue placeholder="Select campaign" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns?.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => analyzeBatch.mutate(selectedCampaign)}
              disabled={!selectedCampaign || analyzeBatch.isPending}
            >
              {analyzeBatch.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                "Start Batch Analysis"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Analysis Results */}
      <Card>
        <CardHeader>
          <CardTitle>Analysis Results</CardTitle>
          <CardDescription>Recent website analysis results</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : analyses?.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No analyses yet. Enter a URL above to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Design Score</TableHead>
                  <TableHead>Missing Services</TableHead>
                  <TableHead>Mobile Friendly</TableHead>
                  <TableHead>Analyzed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analyses?.map((analysis) => (
                  <TableRow key={analysis.id}>
                    <TableCell>{getStatusIcon(analysis.analysis_status)}</TableCell>
                    <TableCell>
                      <a
                        href={analysis.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        {new URL(analysis.website_url).hostname}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </TableCell>
                    <TableCell>
                      {analysis.design_score !== null ? (
                        <Badge className={getScoreColor(analysis.design_score)}>
                          {analysis.design_score}/100
                        </Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {analysis.missing_services?.slice(0, 3).map((service, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {service}
                          </Badge>
                        ))}
                        {(analysis.missing_services?.length || 0) > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{analysis.missing_services!.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {analysis.mobile_friendly === true ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : analysis.mobile_friendly === false ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {analysis.analyzed_at
                        ? format(new Date(analysis.analyzed_at), "MMM d, HH:mm")
                        : "-"}
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
