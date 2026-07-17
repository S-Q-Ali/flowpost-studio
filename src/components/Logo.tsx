import { cn } from "@/lib/utils";

type LogoProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeMap = {
  sm: "w-10 h-10",
  md: "w-12 h-12",
  lg: "w-16 h-16",
};

export function Logo({ size = "md", className }: LogoProps) {
  return (
    <img
      src="/logo.svg"
      alt="FlowPost"
      width={size === "sm" ? 40 : size === "md" ? 48 : 64}
      height={size === "sm" ? 40 : size === "md" ? 48 : 64}
      fetchpriority="high"
      className={cn("rounded-xl object-cover", sizeMap[size], className)}
    />
  );
}
