"use client";

import { useId, type Ref } from "react";
import type { PersonSummary } from "./participants";
import { ResultsList } from "./ResultsList";
import {
  COPY,
  errorCopy,
  formatMinutes,
  retrySeconds,
  type IsochroneView,
  type ScoredCandidate,
  type SearchState,
} from "./results";
import { Alert } from "./ui/Alert";
import { Button } from "./ui/Button";
import { Spinner } from "./ui/Spinner";

export interface ResultsPanelProps {
  state: SearchState;
  people: readonly PersonSummary[];
  selectedId: string | null;
  onSelect: (point: ScoredCandidate) => void;
  /** Repeat the last search (generic error). */
  onRetry: () => void;
  /** Seconds left before a rate-limited search may run again (null/0 = may run). */
  retryIn: number | null;
  /** The goal's UI label, e.g. "Fairest for everyone". */
  goalLabel: string;
  isochrone?: IsochroneView | null;
  /** Only with ?debug=1: number of candidate points drawn on the map. */
  debugCount?: number | null;
  headingRef?: Ref<HTMLHeadingElement>;
}

const SKELETON_ROWS = 3;

/**
 * Results area below the form: nothing before the first search, then
 * skeleton rows (same shapes as real rows, so the layout does not jump),
 * the ranked list, or an error with the UX direction's copy.
 *
 * Submit failures use Alert (role="alert"). The rate-limit countdown ticks
 * visually in an aria-hidden span, while the announced text is fixed, so
 * screen readers hear it once rather than every second.
 */
export function ResultsPanel({
  state,
  people,
  selectedId,
  onSelect,
  onRetry,
  retryIn,
  goalLabel,
  isochrone,
  debugCount,
  headingRef,
}: ResultsPanelProps) {
  const headingId = `results${useId().replace(/:/g, "")}`;
  if (state.status === "idle") return null;
  const loading = state.status === "loading";

  return (
    <section className="results-panel" aria-labelledby={headingId} aria-busy={loading}>
      <h2 id={headingId} tabIndex={-1} ref={headingRef}>
        Meeting points
      </h2>

      {loading ? <Skeleton people={Math.max(2, people.length)} /> : null}

      {state.status === "success" ? (
        <>
          <p className="muted results-panel__intro">
            Ranked by {goalLabel.toLowerCase()}. Bars show each person's travel time on the same scale.
          </p>
          <ResultsList
            results={state.result.points}
            people={people}
            selectedId={selectedId}
            onSelect={onSelect}
            isochrone={isochrone}
          />
          {debugCount != null ? (
            <p className="results-panel__debug">
              Debug: the map shows all {debugCount} candidate points.
            </p>
          ) : null}
        </>
      ) : null}

      {state.status === "error" ? (
        <SearchError error={state.error} retryIn={retryIn} onRetry={onRetry} />
      ) : null}
    </section>
  );
}

function SearchError({
  error,
  retryIn,
  onRetry,
}: {
  error: Extract<SearchState, { status: "error" }>["error"];
  retryIn: number | null;
  onRetry: () => void;
}) {
  if (error.code === "rate_limited") {
    if (!retryIn) {
      return <Alert tone="info">{COPY.canRetry}</Alert>;
    }
    return (
      <Alert tone="error">
        <span className="visually-hidden">{COPY.rateLimited(retrySeconds(error.retryAfterSeconds))}</span>
        {/* Only the number is tabular: tnum also widens the full stops. */}
        <span className="countdown" aria-hidden="true">
          You're searching too fast. Try again in <span className="num">{retryIn}</span>{" "}
          {retryIn === 1 ? "second" : "seconds"}.
        </span>
      </Alert>
    );
  }
  const { message, retry } = errorCopy(error);
  return (
    <Alert
      tone="error"
      action={
        retry ? (
          <Button variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        ) : undefined
      }
    >
      {message}
    </Alert>
  );
}

function Skeleton({ people }: { people: number }) {
  // Varied, fixed widths so the placeholder reads as strips, not a progress bar.
  const widths = [72, 88, 64, 95, 58, 80];
  return (
    <ol className="results results--skeleton" aria-hidden="true">
      {Array.from({ length: SKELETON_ROWS }, (_, row) => (
        <li key={row} className="result result--skeleton">
          <div className="result__head">
            <span className="result__rank" />
            <span className="skeleton-line" style={{ width: `${40 + row * 8}%` }} />
          </div>
          <ul className="strip">
            {Array.from({ length: people }, (_, i) => (
              <li key={i} className="strip__row">
                <span className="skeleton-line skeleton-line--name" />
                <span className="strip__track">
                  <span className="strip__fill" style={{ width: `${widths[(row * 2 + i) % widths.length]}%` }} />
                </span>
                <span className="skeleton-line skeleton-line--value" />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

export interface PeekSummaryProps {
  state: SearchState;
  selected: { rank: number; point: ScoredCandidate } | null;
  /** State of the selected result's isochrone. */
  isochrone: "idle" | "loading" | "ready" | "error";
  retryIn: number | null;
  canSubmit: boolean;
  pending: boolean;
  /** id of the meeting form, so this button submits it from outside. */
  formId: string;
  onExpand: () => void;
}

/**
 * What the collapsed (peek) mobile sheet shows: a one-line status (result
 * count, the selected result, or the error) and the primary action. The
 * submit button submits the form through the `form` attribute; at peek the
 * form itself is hidden, so there is only ever one visible submit button.
 */
export function PeekSummary({
  state,
  selected,
  isochrone,
  retryIn,
  canSubmit,
  pending,
  formId,
  onExpand,
}: PeekSummaryProps) {
  let text: string;
  if (state.status === "loading") text = "Finding meeting points.";
  else if (state.status === "success") {
    const n = state.result.points.length;
    text = selected
      ? `Meeting point ${selected.rank} of ${n}. ` +
        (isochrone === "error"
          ? "We couldn't load the reachable area."
          : `Longest trip ${formatMinutes(selected.point.max)} min.`)
      : `${n} meeting ${n === 1 ? "point" : "points"} found. Pick one to see what's reachable.`;
  } else if (state.status === "error") {
    text =
      state.error.code === "rate_limited"
        ? retryIn
          ? COPY.rateLimited(retryIn)
          : COPY.canRetry
        : errorCopy(state.error).message;
  } else text = canSubmit ? "Ready to find meeting points." : "Add where everyone is starting from.";

  return (
    <div className="peek">
      <p className="peek__text">
        {isochrone === "loading" ? <Spinner size="sm" decorative /> : null}
        <span>{text}</span>
      </p>
      {canSubmit ? (
        <Button
          type="submit"
          form={formId}
          className="peek__action"
          disabled={Boolean(retryIn)}
          loading={pending}
          loadingLabel="Finding meeting points"
        >
          Find meeting points
        </Button>
      ) : (
        <Button variant="secondary" className="peek__action" onClick={onExpand}>
          Add people
        </Button>
      )}
    </div>
  );
}
