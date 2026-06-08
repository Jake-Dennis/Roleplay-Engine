import { InputHTMLAttributes, forwardRef } from "react";
import { clsx } from "clsx";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={id}
            className="block text-sm font-medium text-text-secondary mb-1"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={clsx(
            "w-full px-3 py-2 bg-surface-raised border rounded text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent",
            error
              ? "border-status-error"
              : "border-border focus:border-accent",
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-status-error">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
