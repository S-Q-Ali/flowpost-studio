import {
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
  TikTokIcon,
  YouTubeIcon,
} from "@/components/BrandIcons";
import type { Platform } from "@/lib/types";

const config = {
  facebook: { icon: FacebookIcon, className: "text-facebook", label: "Facebook" },
  instagram: { icon: InstagramIcon, className: "text-instagram", label: "Instagram" },
  youtube: { icon: YouTubeIcon, className: "text-youtube", label: "YouTube" },
  tiktok: { icon: TikTokIcon, className: "text-tiktok", label: "TikTok" },
  linkedin: { icon: LinkedInIcon, className: "text-linkedin", label: "LinkedIn" },
} as const;

export function PlatformIcon({ platform, size = 16 }: { platform: Platform; size?: number }) {
  const { icon: Icon, className, label } = config[platform];
  return <Icon size={size} className={className} label={label} />;
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
