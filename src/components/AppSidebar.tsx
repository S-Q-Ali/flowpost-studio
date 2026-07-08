import {
  LayoutDashboard,
  Upload,
  Workflow,
  Calendar,
  ListTodo,
  Link2,
  BarChart3,
  HardDrive,
  Lock,
  FileText,
  Shield,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Logo } from "@/components/Logo";

const navItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Upload", url: "/upload", icon: Upload },
  { title: "Workflows", url: "/workflows", icon: Workflow },
  { title: "Calendar", url: "/calendar", icon: Calendar },
  { title: "Queue", url: "/queue", icon: ListTodo },
  { title: "Accounts", url: "/accounts", icon: Link2 },
  { title: "Storage", url: "/storage", icon: HardDrive },
  { title: "Insights", url: "/insights", icon: BarChart3 },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { logout } = useAuth();

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
        <Logo size={collapsed ? "sm" : "md"} />
      </div>

      <SidebarContent className="px-2 py-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <item.icon size={18} />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2 border-t border-border">
        <div className={`flex ${collapsed ? 'flex-col items-center' : 'justify-center'} gap-1 mb-1`}>
          <SidebarMenuButton asChild>
            <NavLink
              to="/terms"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground w-full"
              activeClassName="bg-primary/10 text-primary font-medium"
            >
              <FileText size={18} />
              {!collapsed && <span>Terms</span>}
            </NavLink>
          </SidebarMenuButton>
          <SidebarMenuButton asChild>
            <NavLink
              to="/privacy"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground w-full"
              activeClassName="bg-primary/10 text-primary font-medium"
            >
              <Shield size={18} />
              {!collapsed && <span>Privacy</span>}
            </NavLink>
          </SidebarMenuButton>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarMenuButton
                onClick={logout}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground w-full"
              >
                <Lock size={18} />
                {!collapsed && <span>Lock</span>}
              </SidebarMenuButton>
            </TooltipTrigger>
            <TooltipContent side="right">Lock app (logout)</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </SidebarFooter>
    </Sidebar>
  );
}
