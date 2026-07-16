import { Facebook, Instagram, Youtube, Linkedin } from "lucide-react";
import type { Platform } from "@/lib/types";

const TikTokIcon = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-label="TikTok"
  >
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.65a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.08Z" />
  </svg>
);

const config = {
  facebook: { icon: Facebook, className: "text-facebook", label: "Facebook" },
  instagram: { icon: Instagram, className: "text-instagram", label: "Instagram" },
  youtube: { icon: Youtube, className: "text-youtube", label: "YouTube" },
  tiktok: { icon: TikTokIcon, className: "text-tiktok", label: "TikTok" },
  linkedin: { icon: Linkedin, className: "text-linkedin", label: "LinkedIn" },
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
