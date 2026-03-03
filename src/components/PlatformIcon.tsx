import { Facebook, Instagram, Youtube } from "lucide-react";
import type { Platform } from "@/lib/types";

const config = {
  facebook: { icon: Facebook, className: "text-facebook", label: "Facebook" },
  instagram: { icon: Instagram, className: "text-instagram", label: "Instagram" },
  youtube: { icon: Youtube, className: "text-youtube", label: "YouTube" },
} as const;

export function PlatformIcon({ platform, size = 16 }: { platform: Platform; size?: number }) {
  const { icon: Icon, className } = config[platform];
  return <Icon size={size} className={className} />;
}

export function PlatformBadge({ platform }: { platform: Platform }) {
  const { className, label } = config[platform];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${className}`}>
      <PlatformIcon platform={platform} size={12} />
      {label}
    </span>
  );
}
