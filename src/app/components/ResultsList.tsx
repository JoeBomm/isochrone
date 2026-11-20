"use client";

import { useEffect, useRef } from "react";
import { personColourIndex, type PersonSummary } from "./participants";
import {
  formatMinutes,
  longestIndexes,
  stripPercent,
  timeScale,
  type IsochroneView,
  type PlaceView,
  type ScoredCandidate,
} from "./results";
import { Button } from "./ui/Button";
import { Spinner } from "./ui/Spinner";
import { cx } from "./ui/cx";

export interface ResultsListProps {
  /** In ranking order (the server's order). */
  results: readonly ScoredCandidate[];
  /** Same order as each result's perPersonSeconds. */
  people: readonly PersonSummary[];
  selectedId: string | null;
  onSelect: (point: ScoredCandidate) => void;
  /** Isochrone state; shown on the row whose id matches. */
  isochrone?: IsochroneView | null;
  /** Places per result id (only with a place type). The selected result's are classified against its isochrone. */
  places?: Readonly<Record<string, readonly PlaceView[]>>;
}

/**
 * The ranked results as text: the accessible alternative to the map, and the
 * place the fairness strip lives.
 *
 * - A real <ol>; each item has one toggle button (aria-pressed) that names
 *   the result ("Meeting point 1, longest trip 38 min, average 36 min").
 *   The button's hit area is stretched over the whole row in CSS.
 * - The per-person strip is a plain list next to the button (not inside it),
 *   so screen readers can read each time. Every strip uses one time scale
 *   across ALL results. Minutes are always text; colour is never the only cue.
 */
export function ResultsList({ results, people, selectedId, onSelect, isochrone, places }: ResultsListProps) {
  const scale = timeScale(results);
  const listRef = useRef<HTMLOListElement>(null);

  // A selection made on the map scrolls its row into view in the panel.
  useEffect(() => {
    if (!selectedId) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(selectedId)}"]`);
    row?.scrollIntoView?.({ block: "nearest" });
  }, [selectedId]);

  return (
    <ol className="results" aria-label="Meeting points" ref={listRef}>
      {results.map((point, index) => {
        const selected = point.id === selectedId;
        const longest = new Set(longestIndexes(point.perPersonSeconds));
        const iso = selected && isochrone && isochrone.pointId === point.id ? isochrone : null;
        return (
          <li
            key={point.id}
            className="result"
            data-id={point.id}
            data-selected={selected || undefined}
          >
            <div className="result__head">
              <span className="result__rank num" aria-hidden="true">
                {index + 1}
              </span>
              <button
                type="button"
                className="result__select"
                aria-pressed={selected}
                onClick={() => onSelect(point)}
              >
                <span className="visually-hidden">Meeting point {index + 1}, </span>
                <span className="result__title">
                  Longest trip <span className="num">{formatMinutes(point.max)} min</span>
                </span>
                <span className="visually-hidden">, </span>
                <span className="result__meta">
                  Average <span className="num">{formatMinutes(point.mean)} min</span>
                </span>
              </button>
              {iso?.status === "loading" ? (
                <span className="result__spinner">
                  <Spinner size="sm" decorative />
                  <span className="visually-hidden">Loading reachable area</span>
                </span>
              ) : null}
            </div>
            <ul className="strip" aria-label="Travel time for each person">
              {point.perPersonSeconds.map((seconds, i) => {
                const person = people[i];
                const isLongest = longest.has(i);
                return (
                  <li
                    key={i}
                    className={cx("strip__row", isLongest && "strip__row--longest")}
                    data-longest={isLongest || undefined}
                  >
                    <span className="strip__name">{person?.name ?? `Person ${i + 1}`}</span>
                    <span className="strip__track" aria-hidden="true">
                      <span
                        className="strip__fill"
                        style={{
                          width: `${stripPercent(seconds, scale)}%`,
                          background: `var(--person-${personColourIndex(person?.slot ?? i)})`,
                        }}
                      />
                    </span>
                    <span className="strip__value num">{formatMinutes(seconds)} min</span>
                    {isLongest ? <span className="visually-hidden">(longest)</span> : null}
                  </li>
                );
              })}
            </ul>
            {places?.[point.id]?.length ? <PlaceList views={places[point.id]} /> : null}
            {iso?.status === "ready" ? (
              <p className="result__note">
                The map shades everywhere within {iso.minutes} min of here by {iso.modeLabel}.
              </p>
            ) : null}
            {iso?.status === "error" ? (
              <div className="result__error">
                <p>{`We couldn't load the reachable area.${iso.message ? ` ${iso.message}` : ""}`}</p>
                <Button variant="secondary" className="result__retry" onClick={iso.onRetry}>
                  Try again
                </Button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function PlaceList({ views }: { views: readonly PlaceView[] }) {
  return (
    <ul className="places" aria-label="Places nearby">
      {views.map(({ place, inside }) => (
        <li key={place.id} className={cx("places__item", inside === false && "places__item--outside")}>
          <span className="places__name">{place.name}</span>
          {place.address ? <span className="places__address">{place.address}</span> : null}
          {inside !== null ? (
            <span className="places__status">{inside ? "In travel area" : "Outside travel area"}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
