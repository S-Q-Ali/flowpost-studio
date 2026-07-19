import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, RefreshCw } from "lucide-react";
import { PROMPT_TEMPLATES, type MasterPrompt } from "@/lib/prompt-templates";

interface CaptionPromptEditorProps {
  value: MasterPrompt | null;
  onChange: (prompt: MasterPrompt | null) => void;
}

const templateOptions = [
  { value: "custom", label: "Custom (raw JSON)" },
  ...PROMPT_TEMPLATES.map((t) => ({ value: t.name, label: t.name })),
];

export function CaptionPromptEditor({ value, onChange }: CaptionPromptEditorProps) {
  const [activeTab, setActiveTab] = useState<string>("template");

  const handleTemplateSelect = (templateName: string) => {
    if (templateName === "custom") return;
    const template = PROMPT_TEMPLATES.find((t) => t.name === templateName);
    if (template) {
      onChange(template.prompt);
    }
  };

  const updateField = (field: keyof MasterPrompt, val: string) => {
    const current = value ?? { strict_rules: "", output_format: "", example_output: "", hashtags: "", generation_instruction: "" };
    onChange({ ...current, [field]: val });
  };

  const jsonString = value ? JSON.stringify(value, null, 2) : "{}";

  const handleJsonChange = (raw: string) => {
    try {
      const parsed = JSON.parse(raw) as MasterPrompt;
      onChange(parsed);
    } catch {
      // Don't update on parse error — user is typing
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">AI Caption Master Prompt</Label>
        {value && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] gap-1 text-muted-foreground"
            onClick={() => onChange(null)}
          >
            <RefreshCw className="h-3 w-3" />
            Reset to Default
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-8">
          <TabsTrigger value="template" className="text-xs px-3">Template</TabsTrigger>
          <TabsTrigger value="json" className="text-xs px-3">Raw JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="template" className="space-y-3 mt-3">
          <Select onValueChange={handleTemplateSelect}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Choose a template preset..." />
            </SelectTrigger>
            <SelectContent>
              {templateOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {value && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Strict Rules</Label>
                <Textarea
                  className="text-xs min-h-[60px] resize-y"
                  value={value.strict_rules}
                  onChange={(e) => updateField("strict_rules", e.target.value)}
                  placeholder="Rules the AI must follow..."
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Output Format</Label>
                <Textarea
                  className="text-xs min-h-[40px] resize-y"
                  value={value.output_format}
                  onChange={(e) => updateField("output_format", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Example Output</Label>
                <Textarea
                  className="text-xs min-h-[80px] resize-y font-mono"
                  value={value.example_output}
                  onChange={(e) => updateField("example_output", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Default Hashtags</Label>
                <Textarea
                  className="text-xs min-h-[40px] resize-y"
                  value={value.hashtags}
                  onChange={(e) => updateField("hashtags", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Generation Instruction</Label>
                <Textarea
                  className="text-xs min-h-[80px] resize-y"
                  value={value.generation_instruction}
                  onChange={(e) => updateField("generation_instruction", e.target.value)}
                />
              </div>
            </div>
          )}

          {!value && (
            <Card className="bg-muted/30 border-border/50">
              <CardContent className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                Select a template above or switch to Raw JSON to define a custom prompt.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="json" className="mt-3">
          <Textarea
            className="text-xs min-h-[300px] resize-y font-mono"
            value={jsonString}
            onChange={(e) => handleJsonChange(e.target.value)}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Edit the raw JSON prompt. Invalid JSON will not be saved.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
