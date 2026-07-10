import { Badge } from "@/components/ui/badge";

export function BetaBadge() {
  return (
    <Badge
      variant="outline"
      className="text-[10px] px-1 py-0 h-4 bg-amber-500/20 text-amber-600 border-amber-500/30 font-medium"
    >
      Beta
    </Badge>
  );
}
