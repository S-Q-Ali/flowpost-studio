import { useState, useEffect } from "react";
import { File, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { invokeFunction } from "@/lib/invoke";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  thumbnailUrl?: string;
}

export function GoogleDrivePicker() {
  const { userId } = useAuth();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    checkConnection();
  }, [userId]);

  const checkConnection = async () => {
    try {
      const { data } = await invokeFunction("google-drive-auth", {
        method: "POST",
        body: JSON.stringify({ userId, action: "check" }),
      });
      setConnected(!!data?.connected);
    } catch {
      setConnected(false);
    }
  };

  const handleConnect = async () => {
    try {
      setLoading(true);
      const { data } = await invokeFunction("google-drive-auth", {
        method: "POST",
        body: JSON.stringify({ userId, action: "url" }),
      });

      if (data?.url) {
        window.open(data.url, "_blank");
        toast.success("Please authorize in the new tab");
      }
    } catch (error) {
      toast.error("Failed to connect Google Drive");
    } finally {
      setLoading(false);
    }
  };

  const handleListFiles = async () => {
    try {
      setLoading(true);
      const { data } = await invokeFunction("google-drive-auth", {
        method: "POST",
        body: JSON.stringify({ userId, action: "list" }),
      });

      if (data?.files) {
        setFiles(data.files);
        toast.success(`Found ${data.files.length} files`);
      }
    } catch (error) {
      toast.error("Failed to list files");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Google Drive</h3>
          <p className="text-sm text-muted-foreground">
            Select files from your Google Drive
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!connected ? (
            <Button onClick={handleConnect} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <File className="h-4 w-4 mr-2" />
              )}
              Connect
            </Button>
          ) : (
            <Button variant="outline" onClick={handleListFiles} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <File className="h-4 w-4 mr-2" />
              )}
              List Files
            </Button>
          )}
        </div>
      </div>

      {connected && !loading && files.length === 0 && (
        <div className="flex items-start gap-2 text-sm text-muted-foreground p-2 bg-muted rounded">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <p>Click "List Files" to see your Google Drive content</p>
        </div>
      )}

      {connected && !loading && files.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Available Files:</h4>
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 p-3 border rounded hover:bg-muted cursor-pointer"
            >
              <File className="h-8 w-8 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {file.size > 1000000
                    ? `${(file.size / 1000000).toFixed(1)} MB`
                    : `${file.size} bytes`}
                </p>
              </div>
              <Button size="sm">Select</Button>
            </div>
          ))}
        </div>
      )}

      {!connected && (
        <div className="flex items-start gap-2 text-sm text-muted-foreground p-2 bg-muted rounded">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <p>Connect your Google Drive to access files</p>
        </div>
      )}
    </Card>
  );
}
