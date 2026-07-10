import { cn } from "@/lib/utils";

type LogoProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeMap = {
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-14 h-14",
};

export function Logo({ size = "md", className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={cn(sizeMap[size], className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(var(--primary))" />
          <stop offset="100%" stopColor="hsl(var(--primary) / 0.8)" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx="28" fill="hsl(var(--card))" />
      <path
        d="M45,85 C45,75 35,65 35,55 C35,40 50,30 60,25 C65,22 70,20 75,22 C72,25 68,30 65,35 C62,40 58,50 55,60 C52,70 48,78 45,85"
        fill="none"
        stroke="url(#logo-grad)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="45" cy="85" r="3" fill="hsl(var(--primary))" />
      <path
        d="M55,60 C58,55 62,50 68,48 C74,46 80,48 82,52"
        fill="none"
        stroke="hsl(var(--primary) / 0.7)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
