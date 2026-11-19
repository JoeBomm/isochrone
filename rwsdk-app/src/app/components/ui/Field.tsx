import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";

export interface FieldFrameProps {
  label: ReactNode;
  /** Help text under the label, linked with aria-describedby. */
  hint?: ReactNode;
  /** Error text. Sets aria-invalid and is linked with aria-describedby. */
  error?: ReactNode;
  /** Id for the control. Generated with useId when omitted. */
  id?: string;
  className?: string;
}

export interface FieldIds {
  controlId: string;
  hintId: string;
  errorId: string;
}

/** Ids for a labelled control and its hint/error messages. */
export function useFieldIds(id?: string): FieldIds {
  const generated = useId();
  const controlId = id ?? `field${generated.replace(/:/g, "")}`;
  return {
    controlId,
    hintId: `${controlId}-hint`,
    errorId: `${controlId}-error`,
  };
}

/** aria-describedby for a control: hint, then error, then any caller ids. */
export function describedBy(
  ids: FieldIds,
  { hint, error }: { hint?: ReactNode; error?: ReactNode },
  extra?: string,
): string | undefined {
  const parts = [hint ? ids.hintId : null, error ? ids.errorId : null, extra];
  const value = parts.filter(Boolean).join(" ");
  return value || undefined;
}

/**
 * Label, hint and error around a control. The error container is always
 * rendered (empty when there is no error) with aria-live="polite", so an error
 * that appears later is announced.
 */
export function FieldFrame({
  ids,
  label,
  hint,
  error,
  className,
  children,
}: FieldFrameProps & { ids: FieldIds; children: ReactNode }) {
  return (
    <div className={cx("ui-field", error ? "ui-field--invalid" : null, className)}>
      <label className="ui-field__label" htmlFor={ids.controlId}>
        {label}
      </label>
      {hint ? (
        <p className="ui-field__hint" id={ids.hintId}>
          {hint}
        </p>
      ) : null}
      {children}
      <p className="ui-field__error" id={ids.errorId} aria-live="polite">
        {error ?? null}
      </p>
    </div>
  );
}

export interface FieldProps
  extends FieldFrameProps,
    Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className"> {
  /** Class for the input element (the frame takes `className`). */
  inputClassName?: string;
}

/** Text input with label, optional hint and error. */
export function Field({
  label,
  hint,
  error,
  id,
  className,
  inputClassName,
  type = "text",
  "aria-describedby": extraDescribedBy,
  ...inputProps
}: FieldProps) {
  const ids = useFieldIds(id);
  return (
    <FieldFrame ids={ids} label={label} hint={hint} error={error} className={className}>
      <input
        {...inputProps}
        id={ids.controlId}
        type={type}
        className={cx("ui-control", inputClassName)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(ids, { hint, error }, extraDescribedBy)}
      />
    </FieldFrame>
  );
}
