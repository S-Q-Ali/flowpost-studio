import { useEffect, useState } from "react";
import { Menu, Settings, LogOut, Play, Pause, X, Download, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export function SystemTray() {
  const [isTrayAvailable, setIsTrayAvailable] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    // Detect desktop context via Pake/Tauri injection
    setIsTrayAvailable(!!window.__isDesktop);
    
    // Listen for queue updates
    const handleQueueUpdate = () => {
      // TODO: Fetch queue count from Supabase
      // setQueueCount(5);
    };
    
    window.addEventListener('flowpost:queue-update', handleQueueUpdate);
    return () => window.removeEventListener('flowpost:queue-update', handleQueueUpdate);
  }, []);

  // Handle minimize to tray
  useEffect(() => {
    if (!isTrayAvailable) return;

    const handleWindowClose = (e: Event) => {
      e.preventDefault();
      setIsMinimized(true);
      toast.info("App minimized to tray");
      
      // Dispatch event for tray menu to handle
      window.dispatchEvent(new CustomEvent('flowpost:tray-show', {
        detail: { showMenu: true }
      }));
    };

    window.addEventListener("beforeunload", handleWindowClose);
    return () => window.removeEventListener("beforeunload", handleWindowClose);
  }, [isTrayAvailable]);

  // Handle tray menu actions
  useEffect(() => {
    if (!isTrayAvailable) return;

    const handleTrayMenu = (e: CustomEvent) => {
      const { action } = e.detail || {};
      
      switch (action) {
        case 'show':
          window.show();
          setIsMinimized(false);
          break;
        case 'quit':
          window.close();
          break;
        case 'start-workflow':
          window.dispatchEvent(new CustomEvent('flowpost:start-workflow'));
          break;
        case 'settings':
          window.dispatchEvent(new CustomEvent('flowpost:open-settings'));
          break;
      }
    };

    window.addEventListener('flowpost:tray-menu', handleTrayMenu);
    return () => window.removeEventListener('flowpost:tray-menu', handleTrayMenu);
  }, [isTrayAvailable]);

  if (!isTrayAvailable) return null;

  return (
    <div className="hidden">
      {/* Hidden system tray component */}
      {/* Desktop app will use native system tray */}
    </div>
  );
}
