import { Badge } from "@/components/ui/badge";
import type { PostStatus } from "@/lib/types";

const statusConfig = {
  scheduled: { label: "Scheduled", className: "bg-status-scheduled/20 text-status-scheduled border-status-scheduled/30" },
  published: { label: "Published", className: "bg-status-published/20 text-status-published border-status-published/30" },
  failed: { label: "Failed", className: "bg-status-failed/20 text-status-failed border-status-failed/30" },
};

export function StatusBadge({ status }: { status: PostStatus }) {
  const config = statusConfig[status];
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
