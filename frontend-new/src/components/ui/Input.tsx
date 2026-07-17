import type { InputHTMLAttributes } from "react";
import { forwardRef, useId } from "react";
import { cn } from "../../lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, id, label, helperText, error, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const hintId = `${inputId}-hint`;
    const message = error ?? helperText;

    return (
      <div className="space-y-1.5">
        {label ? (
          <label htmlFor={inputId} className="block text-sm font-semibold text-textMain">
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={message ? hintId : undefined}
          className={cn(
            "h-11 w-full rounded-2xl border border-border bg-card/70 px-4 text-right text-textMain shadow-soft outline-none transition-all duration-200 placeholder:text-textMuted/60 focus:border-primary/50 focus:bg-card focus:ring-4 focus:ring-primary/8 disabled:cursor-not-allowed disabled:opacity-60",
            error ? "border-danger/60 focus:border-danger focus:ring-danger/10" : "",
            className,
          )}
          {...props}
        />
        {message ? (
          <p id={hintId} className={cn("text-xs leading-5 px-1", error ? "text-danger" : "text-textMuted")}>
            {message}
          </p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = "Input";