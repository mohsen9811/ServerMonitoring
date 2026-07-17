import { forwardRef, useId } from "react";
import { cn } from "../../lib/utils";
import { Search } from "lucide-react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ value, onChange, placeholder = "جستجو...", className, label }, ref) => {
    const id = useId();
    return (
      <div className="space-y-1.5">
        {label ? <label htmlFor={id} className="block text-sm font-semibold text-textMain">{label}</label> : null}
        <div className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted pointer-events-none" />
          <input
            ref={ref}
            id={id}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={cn(
              "h-11 w-full rounded-2xl border border-border bg-card/70 pr-10 pl-4 text-right text-textMain shadow-soft outline-none transition-all duration-200 placeholder:text-textMuted/60 focus:border-primary/50 focus:bg-card focus:ring-4 focus:ring-primary/8",
              className
            )}
          />
        </div>
      </div>
    );
  }
);
SearchInput.displayName = "SearchInput";

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  label?: string;
}

export function Select({ value, onChange, options, className, label }: SelectProps) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      {label ? <label htmlFor={id} className="block text-sm font-semibold text-textMain">{label}</label> : null}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-11 w-full rounded-2xl border border-border bg-card/70 px-4 text-textMain shadow-soft outline-none transition-all duration-200 focus:border-primary/50 focus:bg-card focus:ring-4 focus:ring-primary/8 appearance-none cursor-pointer",
          className
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}