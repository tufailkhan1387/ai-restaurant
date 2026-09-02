import { useState, useEffect } from "react";
import { Book, Plus, Pencil, Trash2, Save, X, GripVertical } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  category: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function AgentKnowledge() {
  const { t } = useTranslation(["settings", "common"]);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<KnowledgeItem | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    category: "general",
    is_active: true,
  });
  const { toast } = useToast();

  const CATEGORIES = [
    { value: "services", label: t("settings:catServices", "Services") },
    { value: "pricing", label: t("settings:catPricing", "Pricing") },
    { value: "company", label: t("settings:catCompany", "Company Info") },
    { value: "faq", label: t("settings:catFaq", "FAQ") },
    { value: "policies", label: t("settings:catPolicies", "Policies") },
    { value: "general", label: t("settings:catGeneral", "General") },
  ];

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("agent_knowledge")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      toast({
        variant: "destructive",
        title: t("settings:errorLoadingKnowledge", "Error loading knowledge base"),
        description: error.message,
      });
    } else {
      setItems(data || []);
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      toast({
        variant: "destructive",
        title: t("common:validationError", "Validation Error"),
        description: t("settings:titleContentRequired", "Title and content are required"),
      });
      return;
    }

    if (editingItem) {
      const { error } = await supabase
        .from("agent_knowledge")
        .update({
          title: formData.title,
          content: formData.content,
          category: formData.category,
          is_active: formData.is_active,
        })
        .eq("id", editingItem.id);

      if (error) {
        toast({ variant: "destructive", title: t("settings:errorUpdating", "Error updating"), description: error.message });
        return;
      }
      toast({ title: t("settings:updatedSuccessfully", "Updated successfully") });
    } else {
      const { error } = await supabase.from("agent_knowledge").insert({
        title: formData.title,
        content: formData.content,
        category: formData.category,
        is_active: formData.is_active,
        sort_order: items.length,
      });

      if (error) {
        toast({ variant: "destructive", title: t("settings:errorCreating", "Error creating"), description: error.message });
        return;
      }
      toast({ title: t("settings:createdSuccessfully", "Created successfully") });
    }

    setDialogOpen(false);
    resetForm();
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("agent_knowledge").delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: t("settings:errorDeleting", "Error deleting"), description: error.message });
      return;
    }
    toast({ title: t("settings:deletedSuccessfully", "Deleted successfully") });
    fetchItems();
  };

  const toggleActive = async (item: KnowledgeItem) => {
    const { error } = await supabase
      .from("agent_knowledge")
      .update({ is_active: !item.is_active })
      .eq("id", item.id);

    if (error) {
      toast({ variant: "destructive", title: t("settings:errorUpdating", "Error updating"), description: error.message });
      return;
    }
    fetchItems();
  };

  const openEdit = (item: KnowledgeItem) => {
    setEditingItem(item);
    setFormData({
      title: item.title,
      content: item.content,
      category: item.category,
      is_active: item.is_active,
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingItem(null);
    setFormData({ title: "", content: "", category: "general", is_active: true });
  };

  const getCategoryLabel = (value: string) => {
    return CATEGORIES.find((c) => c.value === value)?.label || value;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Book className="h-5 w-5" />
            <CardTitle>{t("settings:agentKnowledgeBase", "Agent Knowledge Base")}</CardTitle>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground">
                <Plus className="h-4 w-4 mr-2" />
                {t("settings:addKnowledge", "Add Knowledge")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingItem ? t("settings:editKnowledgeItem", "Edit Knowledge Item") : t("settings:addKnowledgeItem", "Add Knowledge Item")}
                </DialogTitle>
                <DialogDescription>
                  {t("settings:knowledgeDialogDesc", "Add information the AI agent can use when speaking with customers")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">{t("common:title", "Title")}</Label>
                    <Input
                      id="title"
                      placeholder={t("settings:titlePlaceholder", "e.g., Software Development Services")}
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">{t("settings:category", "Category")}</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="content">{t("settings:content", "Content")}</Label>
                  <Textarea
                    id="content"
                    placeholder={t("settings:contentPlaceholder", "Describe this service or information in detail. The AI agent will use this to answer customer questions.")}
                    className="min-h-[200px]"
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label htmlFor="active">{t("settings:activeIncludeInKnowledge", "Active (include in agent knowledge)")}</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  {t("common:cancel", "Cancel")}
                </Button>
                <Button onClick={handleSubmit} className="gradient-primary text-primary-foreground">
                  <Save className="h-4 w-4 mr-2" />
                  {editingItem ? t("common:update", "Update") : t("common:save", "Save")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <CardDescription>
          {t("settings:agentKnowledgeDesc", "Manage service information and FAQs for the AI agent. You can also upload documents directly to")}{" "}
          <a
            href="https://elevenlabs.io/conversational-ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            ElevenLabs Knowledge Base
          </a>{" "}
          {t("settings:agentKnowledgeDescSuffix", "for document-based knowledge.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">{t("common:loading", "Loading...")}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Book className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{t("settings:noKnowledgeItems", "No knowledge items yet")}</p>
            <p className="text-sm">{t("settings:noKnowledgeItemsDesc", "Add service details, FAQs, and company info for the AI agent")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <GripVertical className="h-5 w-5 text-muted-foreground mt-1 cursor-grab" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium truncate">{item.title}</h4>
                    <Badge variant={item.is_active ? "default" : "secondary"}>
                      {item.is_active ? t("common:active", "Active") : t("common:inactive", "Inactive")}
                    </Badge>
                    <Badge variant="outline">{getCategoryLabel(item.category)}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{item.content}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => toggleActive(item)}>
                    <Switch checked={item.is_active} className="pointer-events-none" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
