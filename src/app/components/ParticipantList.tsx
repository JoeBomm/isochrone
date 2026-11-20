"use client";

import { AddressField } from "./AddressField";
import { Button } from "./ui/Button";
import { cx } from "./ui/cx";
import {
  displayName,
  initialFor,
  MAX_PARTICIPANTS,
  MIN_PARTICIPANTS,
  personColourIndex,
  personShape,
  searchFocus,
  type ParticipantDraft,
  type ResolvedPlace,
} from "./participants";

export interface PersonBadgeProps {
  slot: number;
  /** Badge text: an initial or the person number. */
  initial: string;
  className?: string;
}

/**
 * Colour + initial badge. Colour is never the only cue: the badge always
 * carries text, people 7+ get a square shape, and a ring (--person-ring) gives
 * every colour a >= 3:1 edge. Decorative (aria-hidden): the name is always
 * next to it in text.
 */
export function PersonBadge({ slot, initial, className }: PersonBadgeProps) {
  const n = personColourIndex(slot);
  return (
    <span
      className={cx("person-badge", `person-badge--${personShape(slot)}`, className)}
      style={{ background: `var(--person-${n})`, color: `var(--person-${n}-on)` }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

export interface ParticipantListProps {
  rows: ParticipantDraft[];
  /** Form-level errors by row id (e.g. unresolved text on submit). */
  errors: Record<string, string | undefined>;
  onNameChange: (id: string, name: string) => void;
  onQueryChange: (id: string, query: string) => void;
  onSelect: (id: string, place: ResolvedPlace) => void;
  /** Remove the row, or clear it when only MIN_PARTICIPANTS rows remain. */
  onRemove: (id: string) => void;
  onAdd: () => void;
  /** Registers each row's address input for focus management. */
  addressRef: (id: string) => (el: HTMLInputElement | null) => void;
  headingId: string;
}

/**
 * Labelled list of people. Each row: colour badge, optional name, address
 * search and a Remove button.
 *
 * At the minimum of two rows, Remove becomes Clear (it empties the row rather
 * than removing it), so there are always two rows to fill in and the button
 * never disappears or silently does nothing. Clear is disabled when the row is
 * already empty.
 */
export function ParticipantList({
  rows,
  errors,
  onNameChange,
  onQueryChange,
  onSelect,
  onRemove,
  onAdd,
  addressRef,
  headingId,
}: ParticipantListProps) {
  const atMinimum = rows.length <= MIN_PARTICIPANTS;
  const atMaximum = rows.length >= MAX_PARTICIPANTS;

  return (
    <div className="people">
      <ul className="people__list" aria-labelledby={headingId}>
        {rows.map((row) => {
          const name = displayName(row);
          const number = row.slot + 1;
          const empty = row.name === "" && row.query === "";
          const nameId = `${headingId}-${row.id}-name`;
          return (
            <li key={row.id} className="person">
              <fieldset className="person__fieldset">
                <legend className="visually-hidden">{name}</legend>
                <div className="person__head">
                  <PersonBadge slot={row.slot} initial={initialFor(row)} />
                  <label htmlFor={nameId} className="visually-hidden">
                    {`Name for person ${number} (optional)`}
                  </label>
                  <input
                    id={nameId}
                    type="text"
                    className="ui-control person__name"
                    value={row.name}
                    placeholder="Name (optional)"
                    autoComplete="off"
                    maxLength={40}
                    onChange={(event) => onNameChange(row.id, event.target.value)}
                  />
                  <Button
                    variant="quiet"
                    className="person__remove"
                    aria-label={`${atMinimum ? "Clear" : "Remove"} ${name}`}
                    disabled={atMinimum && empty}
                    onClick={() => onRemove(row.id)}
                  >
                    {atMinimum ? "Clear" : "Remove"}
                  </Button>
                </div>
                <AddressField
                  label={
                    <>
                      Starting address<span className="visually-hidden"> for {name}</span>
                    </>
                  }
                  value={row.query}
                  place={row.place}
                  focus={searchFocus(rows, row.id)}
                  error={errors[row.id]}
                  inputRef={addressRef(row.id)}
                  onChange={(text) => onQueryChange(row.id, text)}
                  onSelect={(place) => onSelect(row.id, place)}
                />
              </fieldset>
            </li>
          );
        })}
      </ul>
      <div className="people__add">
        <Button variant="secondary" onClick={onAdd} disabled={atMaximum}>
          Add person
        </Button>
        {atMaximum ? (
          <p className="muted people__limit">{`You can add up to ${MAX_PARTICIPANTS} people.`}</p>
        ) : null}
      </div>
    </div>
  );
}
