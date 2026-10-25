import { RefreshCw, ArrowLeftRight, LogOut, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function DesktopHeader() {
  const { logout } = useAuth();

  // Refresh page function
  const handleRefresh = async () => {
    toast.info("Refreshing page...");
    window.location.reload();
  };

  // Force sync function
  const handleForceSync = async () => {
    toast.info("Syncing data with server...");
    
    // Trigger manual session verification
    try {
      await supabase.functions.invoke("verify-session", {
        body: {},
      });
      
      // Reload to get fresh data
      window.location.reload();
      toast.success("Data synced successfully!");
    } catch (error) {
      toast.error("Sync failed. Please try again.");
    }
  };

  // Check desktop mode
  const isDesktop = !!window.__isDesktop;

  // Show if in desktop mode
  if (!isDesktop) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-background border-b px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Info className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          Desktop Mode
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Force Sync Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleForceSync}
          className="gap-1"
        >
          <ArrowLeftRight className="h-3 w-3" />
          Sync
        </Button>

        {/* Reload Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          className="gap-1"
        >
          <RefreshCw className="h-3 w-3" />
          Reload
        </Button>

        {/* Separator */}
        <div className="h-4 w-px bg-border mx-1" />

        {/* Logout Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="gap-1 text-muted-foreground hover:text-destructive"
        >
          <LogOut className="h-3 w-3" />
          Logout
        </Button>
      </div>
    </div>
  );
}
