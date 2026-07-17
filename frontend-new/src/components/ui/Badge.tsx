import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type BadgeVariant = "primary" | "success" | "warning" | "danger" | "muted";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  primary: "bg-primaryLight text-primary dark:text-primaryDark dark:bg-primaryLight/60",
  success: "bg-success/10 text-success",
  warning: "bg-warning/12 text-warning",
  danger: "bg-danger/10 text-danger",
  muted: "bg-cardSoft text-textMuted dark:bg-cardSoft/60",
};

export function Badge({ className, variant = "primary", children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold leading-relaxed",
        variantStyles[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}