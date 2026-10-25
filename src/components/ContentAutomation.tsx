import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LocalFileUploader } from "./LocalFileUploader";
import { FolderWatcher } from "./FolderWatcher";
import { Card } from "@/components/ui/card";
import { Upload, Folder, Settings } from "lucide-react";

interface ContentItem {
  id: string;
  name: string;
  source: "gdrive" | "local";
  size: number;
  status: "pending" | "processing" | "ready" | "failed";
}

export function ContentAutomation() {
  const [activeTab, setActiveTab] = useState("upload");
  const [contentQueue, setContentQueue] = useState<ContentItem[]>([]);

  const handleFileSelected = (file: File) => {
    // TODO: Upload to Supabase
    const newItem: ContentItem = {
      id: crypto.randomUUID(),
      name: file.name,
      source: "local",
      size: file.size,
      status: "pending",
    };
    setContentQueue(prev => [newItem, ...prev]);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Content Automation</h1>
        <p className="text-muted-foreground">
          Manage content from Google Drive and your local computer
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="upload">
            <Upload className="h-4 w-4 mr-2" />
            Upload Files
          </TabsTrigger>
          <TabsTrigger value="watch">
            <Folder className="h-4 w-4 mr-2" />
            Folder Watcher
          </TabsTrigger>
          <TabsTrigger value="queue">
            Queue ({contentQueue.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-4">
          <Card className="p-6">
            <LocalFileUploader
              onFileSelected={handleFileSelected}
              mediaType="video"
            />
          </Card>
        </TabsContent>

        <TabsContent value="watch">
          <FolderWatcher />
        </TabsContent>

        <TabsContent value="queue">
          <Card className="p-6">
            {contentQueue.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No files in queue
              </p>
            ) : (
              <div className="space-y-2">
                {contentQueue.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 border rounded">
                    <div className="flex-1">
                      <p className="font-medium truncate">{item.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.size > 1000000
                          ? `${(item.size / 1000000).toFixed(1)} MB`
                          : `${item.size} bytes`}
                      </p>
                    </div>
                    <div className="text-sm">
                      {item.status === "pending" && (
                        <span className="text-yellow-600">Pending</span>
                      )}
                      {item.status === "processing" && (
                        <span className="text-blue-600">Processing</span>
                      )}
                      {item.status === "ready" && (
                        <span className="text-green-600">Ready</span>
                      )}
                      {item.status === "failed" && (
                        <span className="text-red-600">Failed</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
