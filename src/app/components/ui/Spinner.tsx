import { cx } from "./cx";

export type SpinnerSize = "sm" | "md" | "lg";

export interface SpinnerProps {
  /** Accessible name, announced politely. Ignored when `decorative`. */
  label?: string;
  size?: SpinnerSize;
  /**
   * Hide from assistive tech. Use when visible text next to the spinner
   * already says what is happening (for example inside a loading Button).
   */
  decorative?: boolean;
  className?: string;
}

/**
 * Indeterminate progress indicator. Rotation stops under
 * prefers-reduced-motion (the static arc stays visible).
 * Shared component: no hooks, usable from server and client components.
 */
export function Spinner({
  label = "Loading",
  size = "md",
  decorative = false,
  className,
}: SpinnerProps) {
  const svg = (
    <svg
      className="ui-spinner__svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="ui-spinner__track" cx="12" cy="12" r="9" />
      <path className="ui-spinner__arc" d="M12 3a9 9 0 0 1 9 9" />
    </svg>
  );
  const classes = cx("ui-spinner", `ui-spinner--${size}`, className);

  if (decorative) {
    return (
      <span className={classes} aria-hidden="true">
        {svg}
      </span>
    );
  }
  return (
    <span className={classes} role="status">
      {svg}
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
