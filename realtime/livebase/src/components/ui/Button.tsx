import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "./cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type Size = "xs" | "sm" | "md";

const base =
  "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border font-medium select-none transition-colors disabled:cursor-not-allowed disabled:opacity-50";

// Ghost sets its hover text colour inside `:where()` so it carries no extra
// specificity: callers can pass `hover:text-danger` and win.
const variantClass: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-accent text-bg enabled:hover:bg-accent-strong",
  secondary: "border-line bg-surface-2 text-fg enabled:hover:border-line-strong enabled:hover:bg-surface-3",
  ghost: "border-transparent bg-transparent text-fg-muted enabled:hover:bg-surface-2 [&:where(:enabled:hover)]:text-fg",
  danger: "border-danger/30 bg-danger/12 text-danger enabled:hover:bg-danger/20",
};

const sizeClass: Record<Size, string> = {
  xs: "h-6 gap-1 px-2 text-xs",
  sm: "h-7 gap-1.5 px-2.5 text-[13px]",
  md: "h-8 gap-2 px-3 text-sm",
};

// Square buttons share the heights above.
const iconSizeClass: Record<Size, string> = {
  xs: "size-6",
  sm: "size-7",
  md: "size-8",
};

export function Button({
  variant = "secondary",
  size = "md",
  leadingIcon,
  type = "button",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: Size;
  leadingIcon?: ReactNode;
}) {
  return (
    <button type={type} className={cn(base, variantClass[variant], sizeClass[size], className)} {...rest}>
      {leadingIcon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  size = "sm",
  type = "button",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  size?: Size;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(base, variantClass.ghost, iconSizeClass[size], className)}
      {...rest}
    >
      {children}
    </button>
  );
}
