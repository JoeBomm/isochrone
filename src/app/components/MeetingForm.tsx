"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { OptimizationGoal, TravelMode } from "@/domain/types";
import { ParticipantList } from "./ParticipantList";
import { TripOptions } from "./TripOptions";
import { Button } from "./ui/Button";
import {
  DEFAULT_ISOCHRONE_MINUTES,
  displayName,
  initialDrafts,
  initialFor,
  MAX_PARTICIPANTS,
  MIN_PARTICIPANTS,
  newDraft,
  resolvedRows,
  unresolvedRows,
  type MeetingFormValues,
  type ParticipantDraft,
  type ResolvedPlace,
} from "./participants";

export type { FindInput, MeetingFormValues, PersonSummary } from "./participants";

export const UNRESOLVED_MESSAGE = "Choose an address from the suggestions, or clear this field.";

export interface MeetingFormProps {
  /** Called with the server input (plus isochrone minutes and display data). */
  onSubmit: (values: MeetingFormValues) => void;
  /** A search is running: the submit button shows a spinner and ignores clicks. */
  pending: boolean;
  /** Submitting is not allowed right now (rate-limit countdown): submit is disabled. */
  blocked?: boolean;
  /** id for the <form>, so a button elsewhere (the sheet's peek summary) can submit it. */
  formId?: string;
  /** Reports whether enough people are resolved to submit. */
  onCanSubmitChange?: (canSubmit: boolean) => void;
  /**
   * Called when a submit is refused because a field was never resolved, just
   * before focus moves to that field (the page can reveal the form first).
   */
  onInvalid?: () => void;
}

/**
 * People + trip options + "Find meeting points".
 *
 * Submit is disabled until at least MIN_PARTICIPANTS rows are resolved to a
 * geocoded place. Empty rows are ignored on submit; a row with text that was
 * never resolved blocks submit with an inline error and receives focus, so no
 * typed address is silently dropped.
 *
 * The actions bar is sticky at the bottom of the scrolling panel, so the
 * primary button stays visible at the mobile sheet's peek height.
 */
export function MeetingForm({
  onSubmit,
  pending,
  blocked = false,
  formId,
  onCanSubmitChange,
  onInvalid,
}: MeetingFormProps) {
  const [rows, setRows] = useState<ParticipantDraft[]>(initialDrafts);
  const [mode, setMode] = useState<TravelMode>("driving-car");
  const [goal, setGoal] = useState<OptimizationGoal>("MINIMAX");
  const [minutes, setMinutes] = useState(DEFAULT_ISOCHRONE_MINUTES);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [announcement, setAnnouncement] = useState("");
  const [focusRow, setFocusRow] = useState<string | null>(null);
  const base = `form${useId().replace(/:/g, "")}`;
  const peopleHeadingId = `${base}-people`;
  const tripHeadingId = `${base}-trip`;
  const submitHintId = `${base}-submit-hint`;

  const lastId = useRef(MIN_PARTICIPANTS); // initial rows are p1..pN
  const addressInputs = useRef(new Map<string, HTMLInputElement>());
  const refCallbacks = useRef(new Map<string, (el: HTMLInputElement | null) => void>());
  const addressRef = (id: string) => {
    let callback = refCallbacks.current.get(id);
    if (!callback) {
      callback = (el) => {
        if (el) addressInputs.current.set(id, el);
        else addressInputs.current.delete(id);
      };
      refCallbacks.current.set(id, callback);
    }
    return callback;
  };

  // Move focus after add/remove/clear, once the row is in the DOM.
  useEffect(() => {
    if (focusRow === null) return;
    addressInputs.current.get(focusRow)?.focus();
    setFocusRow(null);
  }, [focusRow]);

  const resolvedCount = resolvedRows(rows).length;
  const canSubmit = resolvedCount >= MIN_PARTICIPANTS;

  const reportCanSubmit = useRef(onCanSubmitChange);
  reportCanSubmit.current = onCanSubmitChange;
  useEffect(() => {
    reportCanSubmit.current?.(canSubmit);
  }, [canSubmit]);

  const update = (id: string, change: Partial<ParticipantDraft>) =>
    setRows((current) => current.map((r) => (r.id === id ? { ...r, ...change } : r)));

  const clearError = (id: string) =>
    setErrors((current) => (current[id] ? { ...current, [id]: undefined } : current));

  const handleQueryChange = (id: string, query: string) => {
    update(id, { query, place: null }); // editing always unresolves
    clearError(id);
  };

  const handleSelect = (id: string, place: ResolvedPlace) => {
    update(id, { query: place.label, place });
    clearError(id);
  };

  const handleAdd = () => {
    if (rows.length >= MAX_PARTICIPANTS) return;
    lastId.current += 1;
    const draft = newDraft(rows, `p${lastId.current}`);
    setRows([...rows, draft]);
    setAnnouncement(`${displayName(draft)} added.`);
    setFocusRow(draft.id);
  };

  const handleRemove = (id: string) => {
    const index = rows.findIndex((r) => r.id === id);
    if (index < 0) return;
    const row = rows[index];
    clearError(id);
    if (rows.length <= MIN_PARTICIPANTS) {
      update(id, { name: "", query: "", place: null });
      setAnnouncement(`${displayName(row)} cleared.`);
      setFocusRow(id);
      return;
    }
    const next = rows.filter((r) => r.id !== id);
    setRows(next);
    setAnnouncement(`${displayName(row)} removed.`);
    setFocusRow(next[Math.min(index, next.length - 1)].id);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || blocked || !canSubmit) return;
    const unresolved = unresolvedRows(rows);
    if (unresolved.length > 0) {
      setErrors(Object.fromEntries(unresolved.map((r) => [r.id, UNRESOLVED_MESSAGE])));
      onInvalid?.();
      addressInputs.current.get(unresolved[0].id)?.focus();
      return;
    }
    const people = resolvedRows(rows);
    onSubmit({
      input: {
        participants: people.map((r) => r.place!.coordinate),
        mode,
        goal,
      },
      isochroneMinutes: minutes,
      people: people.map((r) => ({
        slot: r.slot,
        name: displayName(r),
        initial: initialFor(r),
        label: r.place!.label,
      })),
    });
  };

  return (
    <form id={formId} className="meeting-form" onSubmit={handleSubmit} noValidate>
      <section className="meeting-form__section" aria-labelledby={peopleHeadingId}>
        <h2 id={peopleHeadingId}>People</h2>
        <p className="muted">Add where everyone is starting from. You need at least two people.</p>
        <ParticipantList
          rows={rows}
          errors={errors}
          headingId={peopleHeadingId}
          addressRef={addressRef}
          onNameChange={(id, name) => update(id, { name })}
          onQueryChange={handleQueryChange}
          onSelect={handleSelect}
          onRemove={handleRemove}
          onAdd={handleAdd}
        />
        <p className="visually-hidden" role="status">
          {announcement}
        </p>
      </section>

      <section className="meeting-form__section" aria-labelledby={tripHeadingId}>
        <h2 id={tripHeadingId}>Trip</h2>
        <TripOptions
          mode={mode}
          goal={goal}
          minutes={minutes}
          onModeChange={setMode}
          onGoalChange={setGoal}
          onMinutesChange={setMinutes}
        />
      </section>

      <div className="meeting-form__actions">
        <Button
          type="submit"
          className="meeting-form__submit"
          disabled={!canSubmit}
          // A countdown can start while this button has focus: aria-disabled
          // keeps focus where native disabled would drop it to <body>.
          softDisabled={blocked}
          loading={pending}
          loadingLabel="Finding meeting points"
          aria-describedby={canSubmit ? undefined : submitHintId}
        >
          Find meeting points
        </Button>
        {canSubmit ? null : (
          <p id={submitHintId} className="meeting-form__hint muted">
            {resolvedCount === 0
              ? "Choose an address for at least two people."
              : "Choose an address for one more person."}
          </p>
        )}
      </div>
    </form>
  );
}
