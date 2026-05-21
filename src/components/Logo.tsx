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
    <img
      src="/logo.png"
      alt="FlowPost"
      className={cn("rounded-xl object-cover", sizeMap[size], className)}
    />
  );
}
