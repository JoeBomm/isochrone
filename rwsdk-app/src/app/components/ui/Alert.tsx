import type { ReactNode } from "react";
import { cx } from "./cx";

export type AlertTone = "info" | "error";

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Optional action, e.g. a Retry button. */
  action?: ReactNode;
  className?: string;
}

/**
 * Message block. Errors use role="alert" (assertive, for submit failures);
 * info uses role="status" (polite). The tone is shown by icon shape as well as
 * colour. Inline field errors belong in Field, not here.
 */
export function Alert({ tone = "info", title, children, action, className }: AlertProps) {
  return (
    <div
      className={cx("ui-alert", `ui-alert--${tone}`, className)}
      role={tone === "error" ? "alert" : "status"}
    >
      <svg className="ui-alert__icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        {tone === "error" ? (
          <>
            <path d="M10 1.5 19 18H1z" fill="currentColor" />
            <path d="M10 7v5" className="ui-alert__glyph" />
            <circle cx="10" cy="14.75" r="1.1" className="ui-alert__glyph-dot" />
          </>
        ) : (
          <>
            <circle cx="10" cy="10" r="9" fill="currentColor" />
            <path d="M10 9v5.5" className="ui-alert__glyph" />
            <circle cx="10" cy="5.75" r="1.1" className="ui-alert__glyph-dot" />
          </>
        )}
      </svg>
      <div className="ui-alert__body">
        {title ? <p className="ui-alert__title">{title}</p> : null}
        {children ? <div className="ui-alert__text">{children}</div> : null}
        {action ? <div className="ui-alert__action">{action}</div> : null}
      </div>
    </div>
  );
}
