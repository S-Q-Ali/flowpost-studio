import { useEffect, useState } from "react";
import { Folder, FolderOpen, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export function FolderWatcher() {
  const [watchedFolders, setWatchedFolders] = useState<string[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);

  // Desktop-only: Check for file system access
  const canWatchFolders = !!window.__isDesktop;

  useEffect(() => {
    // Load saved folders from localStorage
    const saved = localStorage.getItem("flowpost_watched_folders");
    if (saved) {
      try {
        setWatchedFolders(JSON.parse(saved));
      } catch {
        console.error("Failed to parse watched folders");
      }
    }
  }, []);

  const handleAddFolder = () => {
    if (!canWatchFolders) {
      toast.warning("Folder watching requires desktop app with native file system access");
      return;
    }

    // TODO: Desktop - Use native file picker to select folder
    // For web: Show instruction
    toast.info("In desktop app: Select folder to watch for new files");
  };

  const handleStartMonitoring = () => {
    if (watchedFolders.length === 0) {
      toast.warning("Please add a folder first");
      return;
    }

    setIsMonitoring(true);
    toast.success("Started monitoring folders");

    // TODO: Desktop - Implement folder watcher
    // Watch for new files and auto-process them
    watchedFolders.forEach((folder) => {
      console.log(`Watching: ${folder}`);
      // Desktop: fs.watch(folder, (eventType, filename) => {
      //   if (eventType === 'change') processFile(folder, filename);
      // });
    });
  };

  const handleRemoveFolder = (folder: string) => {
    const updated = watchedFolders.filter(f => f !== folder);
    setWatchedFolders(updated);
    localStorage.setItem("flowpost_watched_folders", JSON.stringify(updated));
    toast.success("Folder removed from watch list");
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Folder Watcher</h3>
          <p className="text-sm text-muted-foreground">
            Auto-process files in selected folders
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddFolder}
            disabled={isMonitoring}
          >
            <Folder className="h-4 w-4 mr-2" />
            Add Folder
          </Button>
          <Button
            size="sm"
            onClick={handleStartMonitoring}
            disabled={isMonitoring || watchedFolders.length === 0}
          >
            {isMonitoring ? (
              <FolderOpen className="h-4 w-4 mr-2" />
            ) : (
              <Folder className="h-4 w-4 mr-2" />
            )}
            {isMonitoring ? "Monitoring" : "Start Monitoring"}
          </Button>
        </div>
      </div>

      {watchedFolders.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Watched Folders:</h4>
          {watchedFolders.map((folder, idx) => (
            <div key={idx} className="flex items-center justify-between p-2 bg-muted rounded">
              <span className="text-sm truncate flex-1">{folder}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveFolder(folder)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      {canWatchFolders && watchedFolders.length === 0 && (
        <div className="flex items-start gap-2 text-sm text-muted-foreground p-2 bg-muted rounded">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <p>
            Select folders to automatically process new files added to them
          </p>
        </div>
      )}

      {!canWatchFolders && (
        <div className="flex items-start gap-2 text-sm text-muted-foreground p-2 bg-muted rounded">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <p>
            Folder watching is available in the desktop app with native file system access
          </p>
        </div>
      )}
    </Card>
  );
}
