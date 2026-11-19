"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { GEOCODE_QUERY_MAX_LENGTH } from "@/domain/constants";
import { geocodeAction } from "@/server/actions";
import { cx } from "./ui/cx";
import { Spinner } from "./ui/Spinner";
import { describedBy, FieldFrame, useFieldIds } from "./ui/Field";
import { MIN_QUERY_LENGTH, type ResolvedPlace } from "./participants";

/** Wait after the last keystroke before searching. */
export const SEARCH_DEBOUNCE_MS = 300;
/** Retry delay when the server rate-limits without a Retry-After value. */
const DEFAULT_RETRY_SECONDS = 10;

export const NOT_FOUND_MESSAGE = "We couldn't find that address. Try adding a city.";
const QUOTA_MESSAGE = "The route service has reached its daily limit. Try again later.";
const FAILED_MESSAGE = "We couldn't search for addresses just now. Try again.";

const rateLimitedMessage = (seconds: number) =>
  `You're searching too fast. Try again in ${seconds} ${seconds === 1 ? "second" : "seconds"}.`;

type SearchError =
  | { kind: "message"; text: string }
  | { kind: "rate_limited"; secondsLeft: number };

type GeocodeResponse = Awaited<ReturnType<typeof geocodeAction>>;

function errorFromResponse(error: Extract<GeocodeResponse, { ok: false }>["error"]): SearchError {
  switch (error.code) {
    case "not_found":
      return { kind: "message", text: NOT_FOUND_MESSAGE };
    case "rate_limited":
      return {
        kind: "rate_limited",
        secondsLeft: Math.max(1, Math.ceil(error.retryAfterSeconds ?? DEFAULT_RETRY_SECONDS)),
      };
    case "quota":
      return { kind: "message", text: QUOTA_MESSAGE };
    default:
      // validation / upstream / no_reachable_point: the server's messages are
      // already human-readable and contain no internals.
      return { kind: "message", text: error.message || FAILED_MESSAGE };
  }
}

export interface AddressFieldProps {
  /** Label, e.g. "Starting address" plus a visually hidden " for Ana". */
  label: ReactNode;
  /** Text in the field (controlled). */
  value: string;
  /** The resolved place, or null while the text is unresolved. */
  place: ResolvedPlace | null;
  /** The user edited the text. The parent must clear `place`. */
  onChange: (text: string) => void;
  /** The user chose a suggestion. The parent sets value to place.label. */
  onSelect: (place: ResolvedPlace) => void;
  /** Error from the form (e.g. unresolved on submit). Shown before search errors. */
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * Address search as an ARIA 1.2 combobox with a listbox popup (WAI-ARIA APG
 * "Combobox with list autocomplete"):
 * - DOM focus stays on the input; the highlighted option is conveyed with
 *   aria-activedescendant and aria-selected.
 * - ArrowDown/ArrowUp open the list and move through options (wrapping);
 *   Enter selects the highlighted option; Escape closes the list (it does not
 *   clear the text: the APG makes that optional); Tab closes the list and
 *   keeps the typed text (nothing is selected).
 *
 * Search: debounced (SEARCH_DEBOUNCE_MS) after typing at least
 * MIN_QUERY_LENGTH characters. A new keystroke cancels the pending timer;
 * server functions cannot be aborted, so in-flight responses are tagged with
 * a sequence number and any response that is not the latest is ignored.
 */
export function AddressField({
  label,
  value,
  place,
  onChange,
  onSelect,
  error: formError,
  inputRef,
}: AddressFieldProps) {
  const ids = useFieldIds();
  const listboxId = `${ids.controlId}-listbox`;
  const statusId = `${ids.controlId}-status`;
  const resolvedId = `${ids.controlId}-resolved`;
  const optionId = (index: number) => `${ids.controlId}-option-${index}`;

  const [suggestions, setSuggestions] = useState<ResolvedPlace[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<SearchError | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0);
  const latestValue = useRef(value);
  latestValue.current = value;
  const cache = useRef(new Map<string, ResolvedPlace[]>());
  const searchRef = useRef<(query: string) => void>(() => {});

  const cancelPending = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    sequence.current += 1; // any in-flight response is now stale
    setSearching(false);
  };

  const closeList = () => {
    setOpen(false);
    setActive(-1);
  };

  const showResults = (results: ResolvedPlace[]) => {
    setSuggestions(results);
    setActive(-1);
    setOpen(results.length > 0);
  };

  const search = async (query: string) => {
    const key = query.trim().toLowerCase();
    const hit = cache.current.get(key);
    if (hit) {
      showResults(hit);
      return;
    }
    const id = ++sequence.current;
    setSearching(true);
    let response: GeocodeResponse;
    try {
      response = await geocodeAction(query);
    } catch {
      if (id !== sequence.current) return;
      setSearching(false);
      setSearchError({ kind: "message", text: FAILED_MESSAGE });
      return;
    }
    if (id !== sequence.current) return; // stale: newer text or a selection since
    setSearching(false);
    if (response.ok) {
      const results = response.data.results;
      cache.current.set(key, results);
      setSearchError(null);
      showResults(results);
    } else {
      setSuggestions([]);
      closeList();
      setSearchError(errorFromResponse(response.error));
    }
  };
  searchRef.current = search;

  const schedule = (text: string) => {
    cancelPending();
    if (text.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      closeList();
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      void searchRef.current(text);
    }, SEARCH_DEBOUNCE_MS);
  };

  // Rate-limit countdown: tick every second, then search the current text again.
  const rateLimited = searchError?.kind === "rate_limited";
  useEffect(() => {
    if (!rateLimited) return;
    const interval = setInterval(() => {
      setSearchError((current) => {
        if (current?.kind !== "rate_limited") return current;
        if (current.secondsLeft > 1) return { ...current, secondsLeft: current.secondsLeft - 1 };
        return null;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [rateLimited]);

  const wasRateLimited = useRef(false);
  useEffect(() => {
    if (wasRateLimited.current && !rateLimited) {
      const text = latestValue.current;
      if (place === null && text.trim().length >= MIN_QUERY_LENGTH) void searchRef.current(text);
    }
    wasRateLimited.current = rateLimited;
  }, [rateLimited, place]);

  // The parent cleared the field (e.g. "Clear"): drop suggestions and errors.
  useEffect(() => {
    if (value === "") {
      cancelPending();
      setSuggestions([]);
      closeList();
      setSearchError(null);
    }
  }, [value]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
      sequence.current += 1;
    },
    [],
  );

  // Keep the highlighted option visible inside a scrolled list or panel.
  useEffect(() => {
    if (active < 0) return;
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
  }, [active]); // optionId derives from a stable id

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value;
    onChange(text);
    // While rate limited, keep the countdown: it searches the latest text
    // when it ends (no extra requests in the meantime).
    if (rateLimited) return;
    setSearchError(null);
    schedule(text);
  };

  const select = (index: number) => {
    const chosen = suggestions[index];
    if (!chosen) return;
    cancelPending();
    closeList();
    setSearchError(null);
    onSelect(chosen);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const count = suggestions.length;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (count === 0) return;
        event.preventDefault();
        if (event.altKey) {
          setOpen(true);
          return;
        }
        const down = event.key === "ArrowDown";
        setOpen(true);
        setActive((current) => {
          if (!open || current < 0) return down ? 0 : count - 1;
          return down ? (current + 1) % count : (current - 1 + count) % count;
        });
        return;
      }
      case "Enter":
        if (open) {
          event.preventDefault(); // never submit the form from an open list
          if (active >= 0) select(active);
          else closeList();
        }
        return;
      case "Escape":
        if (open || timer.current !== null) {
          event.preventDefault();
          cancelPending();
          closeList();
        }
        return;
      case "Tab":
        closeList();
        return;
      default:
        return;
    }
  };

  const message =
    formError ??
    (searchError === null
      ? undefined
      : searchError.kind === "rate_limited"
        ? rateLimitedMessage(searchError.secondsLeft)
        : searchError.text);

  const expanded = open && suggestions.length > 0;
  const statusText = searching
    ? "Searching"
    : expanded
      ? `${suggestions.length} ${suggestions.length === 1 ? "suggestion" : "suggestions"}. Use the up and down arrows to choose.`
      : "";

  return (
    <FieldFrame ids={ids} label={label} error={message} className="address">
      <div className="address__control">
        <input
          ref={inputRef}
          id={ids.controlId}
          type="text"
          role="combobox"
          className={cx("ui-control", "address__input")}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={closeList}
          placeholder="Street, town or postcode"
          autoComplete="off"
          spellCheck={false}
          maxLength={GEOCODE_QUERY_MAX_LENGTH}
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listboxId}
          aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
          aria-invalid={message ? true : undefined}
          aria-describedby={describedBy(ids, { error: message }, place ? resolvedId : undefined)}
        />
        {searching ? (
          <span className="address__indicator">
            <Spinner size="sm" decorative />
          </span>
        ) : place ? (
          <span className="address__indicator address__indicator--resolved" aria-hidden="true">
            <svg viewBox="0 0 16 16" focusable="false">
              <path d="M3 8.5 6.5 12 13 4.5" />
            </svg>
          </span>
        ) : null}
      </div>
      {place ? (
        <span id={resolvedId} className="visually-hidden">
          Location set.
        </span>
      ) : null}
      <span id={statusId} role="status" className="visually-hidden">
        {statusText}
      </span>
      {/* Always rendered so aria-controls never points at a missing element. */}
      <ul
        id={listboxId}
        role="listbox"
        aria-label="Address suggestions"
        className="address__list"
        hidden={!expanded}
      >
        {expanded
          ? suggestions.map((suggestion, index) => (
              <li
                key={`${suggestion.label}-${index}`}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                className="address__option"
                // Keep DOM focus in the input (APG): the option is chosen on click.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(index)}
                onMouseMove={() => {
                  if (active !== index) setActive(index);
                }}
              >
                {suggestion.label}
              </li>
            ))
          : null}
      </ul>
    </FieldFrame>
  );
}
