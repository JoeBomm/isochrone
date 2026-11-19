import type { ReactNode, SelectHTMLAttributes } from "react";
import { cx } from "./cx";
import { describedBy, FieldFrame, useFieldIds, type FieldFrameProps } from "./Field";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends FieldFrameProps,
    Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "className"> {
  /** Options to render. Alternatively pass <option> children. */
  options?: SelectOption[];
  children?: ReactNode;
  selectClassName?: string;
}

/**
 * Native <select> with the same label/hint/error frame as Field. The chevron is
 * drawn in CSS (no data: image, which the CSP would block).
 */
export function Select({
  label,
  hint,
  error,
  id,
  className,
  selectClassName,
  options,
  children,
  "aria-describedby": extraDescribedBy,
  ...selectProps
}: SelectProps) {
  const ids = useFieldIds(id);
  return (
    <FieldFrame ids={ids} label={label} hint={hint} error={error} className={className}>
      <span className="ui-select">
        <select
          {...selectProps}
          id={ids.controlId}
          className={cx("ui-control", "ui-select__control", selectClassName)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(ids, { hint, error }, extraDescribedBy)}
        >
          {options
            ? options.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </option>
              ))
            : children}
        </select>
      </span>
    </FieldFrame>
  );
}
