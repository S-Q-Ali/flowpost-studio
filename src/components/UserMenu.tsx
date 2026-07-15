import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, LayoutDashboard, Lock, BadgeCheck } from "lucide-react";

interface UserProfile {
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  is_admin: boolean;
}

export function UserMenu() {
  const { userId, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("users")
      .select("name, email, avatar_url, is_admin")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data);
      });
  }, [userId]);

  const initials = (profile?.name || profile?.email || "U")
    .split(/[ @.]/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "U";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <Avatar className="h-8 w-8 border border-border">
          <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.name || "User"} />
          <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <ChevronDown size={14} className="text-muted-foreground hidden sm:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground truncate max-w-[140px]">
                {profile?.name || "User"}
              </span>
              {isAdmin && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950 px-1.5 py-0.5 rounded">
                  <BadgeCheck size={12} />
                  Admin
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground truncate">
              {profile?.email || ""}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer gap-2">
          <LayoutDashboard size={16} />
          Dashboard
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="cursor-pointer gap-2 text-destructive focus:text-destructive">
          <Lock size={16} />
          Lock
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
