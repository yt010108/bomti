import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  loading?: boolean;
  variant?: ButtonVariant;
};

export function Button({ children, className = "", disabled, loading = false, variant = "primary", ...props }: ButtonProps) {
  const variantClass = variant === "primary" ? "" : ` bomti-button--${variant}`;
  return (
    <button
      className={`bomti-button${variantClass}${className ? ` ${className}` : ""}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="bomti-spinner" aria-hidden="true" /> : null}
      {loading ? "평가 중" : children}
    </button>
  );
}
