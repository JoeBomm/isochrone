"use client";

import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { cx } from "./cx";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "quiet";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Shows a spinner and blocks activation. */
  loading?: boolean;
  /** Text shown while loading, e.g. "Finding meeting points". */
  loadingLabel?: string;
}

/**
 * Button with primary (harbour fill), secondary (outline) and quiet (text)
 * variants.
 *
 * Loading uses aria-disabled rather than the native `disabled` attribute so a
 * focused button keeps focus while work is in progress (a natively disabled
 * button drops focus to <body>). Clicks are swallowed while loading, which also
 * stops a submit button from re-submitting its form.
 *
 * A client component so it can attach its own click guard; server components
 * can still render it (with serialisable props only).
 */
export function Button({
  variant = "primary",
  loading = false,
  loadingLabel,
  disabled,
  className,
  children,
  type = "button",
  onClick,
  ...rest
}: ButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  return (
    <button
      {...rest}
      type={type}
      className={cx("ui-btn", `ui-btn--${variant}`, className)}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      onClick={handleClick}
    >
      {loading ? <Spinner size="sm" decorative /> : null}
      <span className="ui-btn__label">
        {loading && loadingLabel ? loadingLabel : children}
      </span>
    </button>
  );
}
