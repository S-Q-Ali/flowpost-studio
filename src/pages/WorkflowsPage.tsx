import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PlatformBadge } from "@/components/PlatformIcon";
import { Plus, Workflow, Zap } from "lucide-react";
import { toast } from "sonner";
import type { Workflow as WorkflowType, Platform } from "@/lib/types";

const PERSONAL_USER_ID = "00000000-0000-0000-0000-000000000000";

const platformOptions: { id: Platform; label: string }[] = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram Reels" },
  { id: "youtube", label: "YouTube Shorts" },
];

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowType[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [captionTemplate, setCaptionTemplate] = useState("{{title}} {{hashtags}}");
  const [delayHours, setDelayHours] = useState(0);

  const fetchWorkflows = async () => {
    const { data } = await supabase.from("workflows").select("*").eq("user_id", PERSONAL_USER_ID).order("created_at", { ascending: false });
    setWorkflows((data as any) ?? []);
  };

  useEffect(() => { fetchWorkflows(); }, []);

  const togglePlatform = (p: Platform) => {
    setPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  };

  const handleCreate = async () => {
    if (!name || platforms.length === 0) {
      toast.error("Name and at least one platform are required");
      return;
    }
    const { error } = await supabase.from("workflows").insert({
      user_id: PERSONAL_USER_ID,
      name,
      destination_platforms: platforms,
      caption_template: captionTemplate,
      delay_hours: delayHours,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Workflow created!");
    setOpen(false);
    setName("");
    setPlatforms([]);
    fetchWorkflows();
  };

  const toggleActive = async (wf: WorkflowType) => {
    await supabase.from("workflows").update({ is_active: !wf.is_active }).eq("id", wf.id);
    fetchWorkflows();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Workflows</h1>
          <p className="text-sm text-muted-foreground">Automate your content distribution</p>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button className="gradient-primary text-primary-foreground gap-2"><Plus size={16} /> Create Workflow</Button>
          </SheetTrigger>
          <SheetContent className="bg-card border-border overflow-auto">
            <SheetHeader><SheetTitle className="text-foreground">New Workflow</SheetTitle></SheetHeader>
            <div className="space-y-5 mt-6">
              <div className="space-y-2">
                <Label>Workflow Name</Label>
                <Input placeholder="e.g. Auto-post to all platforms" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Trigger</Label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary text-sm text-muted-foreground">
                  <Zap size={14} className="text-primary" />
                  When I upload a new video manually
                </div>
              </div>
              <div className="space-y-2">
                <Label>Auto-post to</Label>
                {platformOptions.map((p) => (
                  <label key={p.id} className="flex items-center gap-3 cursor-pointer">
                    <Checkbox checked={platforms.includes(p.id)} onCheckedChange={() => togglePlatform(p.id)} />
                    <span className="text-sm text-foreground">{p.label}</span>
                  </label>
                ))}
              </div>
              <div className="space-y-2">
                <Label>Caption Template</Label>
                <Textarea value={captionTemplate} onChange={(e) => setCaptionTemplate(e.target.value)} rows={3} />
                <p className="text-xs text-muted-foreground">Variables: {"{{title}}"}, {"{{hashtags}}"}</p>
              </div>
              <div className="space-y-2">
                <Label>Delay (hours)</Label>
                <Input type="number" min={0} value={delayHours} onChange={(e) => setDelayHours(Number(e.target.value))} />
              </div>
              <Button className="w-full gradient-primary text-primary-foreground" onClick={handleCreate}>Save Workflow</Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {workflows.length === 0 ? (
        <Card className="bg-card border-border shadow-card">
          <CardContent className="flex flex-col items-center py-16">
            <Workflow size={48} className="text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No workflows yet. Create one to automate distribution!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {workflows.map((wf) => (
            <Card key={wf.id} className="bg-card border-border shadow-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-foreground text-base">{wf.name}</CardTitle>
                <Switch checked={wf.is_active} onCheckedChange={() => toggleActive(wf)} />
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-2">Trigger: Manual upload</p>
                <div className="flex gap-2 flex-wrap">
                  {wf.destination_platforms.map((p) => (
                    <PlatformBadge key={p} platform={p as Platform} />
                  ))}
                </div>
                {wf.delay_hours > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">Delay: {wf.delay_hours}h after upload</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
