import type { ButtonHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../../lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white shadow-glow hover:bg-primaryDark focus-visible:bg-primaryDark active:scale-[0.98]",
  secondary:
    "bg-primaryLight text-primary hover:bg-primaryLight/80 focus-visible:bg-primaryLight/80 active:scale-[0.98] dark:text-primaryDark",
  ghost:
    "bg-transparent text-textMain hover:bg-primaryLight hover:text-primary focus-visible:bg-primaryLight focus-visible:text-primary active:scale-[0.98] dark:hover:text-primaryDark dark:focus-visible:text-primaryDark",
  outline:
    "border border-border bg-card/60 text-textMain hover:border-primary/30 hover:bg-primaryLight/50 focus-visible:border-primary/30 focus-visible:bg-primaryLight/50 active:scale-[0.98]",
  danger:
    "border border-danger/25 bg-danger/5 text-danger hover:bg-danger/10 focus-visible:bg-danger/10 active:scale-[0.98]",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 rounded-xl px-3.5 text-xs",
  md: "h-11 rounded-2xl px-5 text-sm",
  lg: "h-13 rounded-2xl px-6 text-base",
  icon: "h-10 w-10 rounded-2xl p-0",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", type = "button", children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 disabled:scale-100 select-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
Button.displayName = "Button";