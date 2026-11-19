import { useId, type HTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Optional heading. When set the card is a labelled <section>. */
  title?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  children?: ReactNode;
}

/**
 * Surface container. Per the UX direction, use sparingly: the isochrone
 * summary and the styleguide. Results are rows separated by rules, not cards.
 */
export function Card({ title, headingLevel = 3, className, children, ...rest }: CardProps) {
  const generated = useId();
  const headingId = `card${generated.replace(/:/g, "")}-title`;
  const Heading = `h${headingLevel}` as const;

  if (title == null) {
    return (
      <div {...rest} className={cx("ui-card", className)}>
        {children}
      </div>
    );
  }
  return (
    <section {...rest} className={cx("ui-card", className)} aria-labelledby={headingId}>
      <Heading className="ui-card__title" id={headingId}>
        {title}
      </Heading>
      {children}
    </section>
  );
}
