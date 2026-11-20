"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { MeetingForm, type MeetingFormValues, type PersonSummary, type ResolvedPerson } from "@/app/components/MeetingForm";
import { MeetingMap } from "@/app/components/MeetingMap";
import type { Coordinate } from "@/domain/types";
import { GOALS } from "@/app/components/participants";
import { PeekSummary, ResultsPanel } from "@/app/components/ResultsPanel";
import {
  DESKTOP_MIN_WIDTH,
  errorCopy,
  MODE_LABEL,
  retrySeconds,
  sheetInsetPx,
  THROWN_ERROR,
  type IsochroneGeometry,
  type IsochroneView,
  type ScoredCandidate,
  type SearchState,
  placeViews,
} from "@/app/components/results";
import { AppShell } from "@/app/components/shell/AppShell";
import type { SheetSnap } from "@/app/components/shell/BottomSheet";
import { findMeetingPointsAction, getIsochroneAction } from "@/server/actions";

type IsoState =
  | { status: "idle" }
  | { status: "loading"; pointId: string }
  | { status: "ready"; pointId: string; geometry: IsochroneGeometry }
  | { status: "error"; pointId: string; message: string };

function useViewport() {
  const [viewport, setViewport] = useState({ width: 1280, height: 800, rem: 16 });
  useEffect(() => {
    const read = () =>
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
        rem: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16,
      });
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return viewport;
}

/**
 * Extra sentence after "We couldn't load the reachable area." Only when it
 * adds something: the generic failure would just repeat the Try again button.
 */
function isochroneErrorDetail(error: Parameters<typeof errorCopy>[0]): string {
  const { message, retry } = errorCopy(error);
  return retry ? "" : message;
}

const isMobileLayout = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.(`(min-width: ${DESKTOP_MIN_WIDTH}px)`).matches !== true;

const focusIsIn = (selector: string) =>
  document.activeElement instanceof Element && document.activeElement.closest(selector) !== null;

export interface HomePageProps {
  /** `?debug=1`: show every evaluated candidate on the map (read on the server). */
  debug: boolean;
  /** Approximate visitor location (IP-based, read on the server) to start the map at. */
  initialCenter?: Coordinate;
}

/**
 * The app: form, results and map in the responsive shell.
 *
 * Flow: submit -> findMeetingPointsAction -> ranked results (no isochrone yet)
 * -> the user picks a result (list or map) -> getIsochroneAction for that
 * point with the form's mode and minutes -> polygon on the map.
 *
 * Server functions cannot be aborted, so every request gets a sequence
 * number and only the latest one may update state; responses after unmount
 * are dropped too. Isochrones are cached per point/minutes/mode for the
 * current results, so re-selecting does not call the server again.
 */
export function HomePage({ debug, initialCenter }: HomePageProps) {
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const [values, setValues] = useState<MeetingFormValues | null>(null);
  // Resolved people in the form right now (shown on the map before any search).
  const [placed, setPlaced] = useState<ResolvedPerson[]>([]);
  const placedCoordinates = useMemo(() => placed.map((p) => p.coordinate), [placed]);
  const placedPeople = useMemo<PersonSummary[]>(() => placed.map((p) => p.person), [placed]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [iso, setIso] = useState<IsoState>({ status: "idle" });
  const [retryIn, setRetryIn] = useState<number | null>(null);
  const [snap, setSnap] = useState<SheetSnap>("half");
  const [canSubmit, setCanSubmit] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const formId = `meeting-form${useId().replace(/:/g, "")}`;
  const viewport = useViewport();

  const mounted = useRef(true);
  const searchSeq = useRef(0);
  const isoSeq = useRef(0);
  const isoCache = useRef(new Map<string, IsochroneGeometry>());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const revealResults = useRef(false);
  const summaryTextRef = useRef<HTMLParagraphElement>(null);
  const snapRef = useRef(snap);
  snapRef.current = snap;
  // Focus to move once a snap change has rendered (the target may only become
  // visible with the new snap, e.g. the peek summary).
  const focusAfterSnap = useRef<(() => void) | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const run = focusAfterSnap.current;
    focusAfterSnap.current = null;
    run?.();
  }, [snap]);

  const formControl = useCallback(
    (selector: string) => document.getElementById(formId)?.querySelector<HTMLElement>(selector) ?? null,
    [formId],
  );

  // Rate-limit countdown: one tick per second; at 0 the button is enabled again.
  useEffect(() => {
    if (!retryIn) return;
    const timer = setTimeout(() => setRetryIn((n) => (n ? n - 1 : 0)), 1000);
    return () => clearTimeout(timer);
  }, [retryIn]);

  // After a search: on success, move focus to the results heading so the
  // outcome is announced and the list is next in the tab order. On an error
  // (announced by its role="alert"), only scroll it into view: the form can
  // be taller than the panel, and focus stays on the button.
  useEffect(() => {
    if (!revealResults.current) return;
    if (search.status === "success") {
      revealResults.current = false;
      headingRef.current?.focus();
    } else if (search.status === "error") {
      revealResults.current = false;
      headingRef.current?.scrollIntoView?.({ block: "start" });
    }
  }, [search]);

  const runSearch = useCallback(async (next: MeetingFormValues) => {
    const seq = ++searchSeq.current;
    isoSeq.current += 1; // drop any isochrone still in flight
    isoCache.current.clear();
    setValues(next);
    setSelectedId(null);
    setIso({ status: "idle" });
    setRetryIn(null);
    setSearch({ status: "loading" });
    // Submitted from the peek summary: the summary is hidden at half, so its
    // focused button would drop focus to <body>. Move focus to the form's own
    // submit button (visible at half); on success it then moves to the
    // results heading, on error it stays there.
    if (snapRef.current === "peek" && focusIsIn(".sheet__summary")) {
      focusAfterSnap.current = () => formControl('button[type="submit"]')?.focus();
    }
    setSnap((s) => (s === "peek" ? "half" : s));
    setAnnouncement("Finding meeting points.");
    let outcome: SearchState;
    try {
      const res = await findMeetingPointsAction(next.input);
      outcome = res.ok ? { status: "success", result: res.data } : { status: "error", error: res.error };
    } catch {
      outcome = { status: "error", error: THROWN_ERROR };
    }
    if (!mounted.current || seq !== searchSeq.current) return;
    revealResults.current = true;
    if (outcome.status === "success") {
      const n = outcome.result.points.length;
      setAnnouncement(`${n} meeting ${n === 1 ? "point" : "points"} found.`);
    } else if (outcome.status === "error") {
      setAnnouncement("");
      if (outcome.error.code === "rate_limited") setRetryIn(retrySeconds(outcome.error.retryAfterSeconds));
    }
    setSearch(outcome);
  }, [formControl]);

  const loadIsochrone = useCallback(
    async (point: ScoredCandidate) => {
      if (!values) return;
      const { mode } = values.input;
      const minutes = values.isochroneMinutes;
      const key = `${point.id}|${minutes}|${mode}`;
      const seq = ++isoSeq.current;
      const cachedGeometry = isoCache.current.get(key);
      if (cachedGeometry) {
        setIso({ status: "ready", pointId: point.id, geometry: cachedGeometry });
        setAnnouncement(`The map shows everywhere within ${minutes} minutes of the meeting point.`);
        return;
      }
      setIso({ status: "loading", pointId: point.id });
      setAnnouncement("Loading reachable area.");
      let next: IsoState;
      try {
        const res = await getIsochroneAction({ center: point.coordinate, minutes, mode });
        next = res.ok
          ? { status: "ready", pointId: point.id, geometry: res.data.geometry }
          : { status: "error", pointId: point.id, message: isochroneErrorDetail(res.error) };
      } catch {
        next = { status: "error", pointId: point.id, message: "" };
      }
      if (!mounted.current || seq !== isoSeq.current) return;
      if (next.status === "ready") isoCache.current.set(key, next.geometry);
      setAnnouncement(
        next.status === "ready"
          ? `The map shows everywhere within ${minutes} minutes of the meeting point.`
          : `We couldn't load the reachable area. ${next.status === "error" ? next.message : ""}`.trim(),
      );
      setIso(next);
    },
    [values],
  );

  const select = useCallback(
    (point: ScoredCandidate) => {
      setSelectedId(point.id);
      // On mobile, selecting from the list collapses the sheet to peek, which
      // hides the focused row: move focus to the peek summary that now
      // describes the selection. (From the map, focus stays on the marker; on
      // desktop nothing is hidden.)
      if (snapRef.current !== "peek" && isMobileLayout() && focusIsIn(".sheet__body")) {
        focusAfterSnap.current = () => summaryTextRef.current?.focus();
      }
      setSnap("peek");
      void loadIsochrone(point);
    },
    [loadIsochrone],
  );

  const points = search.status === "success" ? search.result.points : [];
  const selectedIndex = points.findIndex((p) => p.id === selectedId);
  const selectedPoint = selectedIndex >= 0 ? points[selectedIndex] : null;

  const isochroneView: IsochroneView | null =
    values && iso.status !== "idle"
      ? {
          pointId: iso.pointId,
          status: iso.status,
          minutes: values.isochroneMinutes,
          modeLabel: MODE_LABEL[values.input.mode] ?? "car",
          message: iso.status === "error" ? iso.message : undefined,
          onRetry: () => {
            if (selectedPoint) void loadIsochrone(selectedPoint);
          },
        }
      : null;

  // Places per result, with the selected one classified once its isochrone is
  // ready (a client-side point-in-polygon test, no extra API call).
  const resultPlaces = search.status === "success" ? search.result.places : undefined;
  const selectedGeometry = iso.status === "ready" && iso.pointId === selectedId ? iso.geometry : null;
  const placesById = useMemo(() => {
    if (!resultPlaces) return undefined;
    return Object.fromEntries(
      Object.entries(resultPlaces).map(([id, list]) => [id, placeViews(list, id === selectedId ? selectedGeometry : null)]),
    );
  }, [resultPlaces, selectedId, selectedGeometry]);
  const selectedPlaces = selectedId ? placesById?.[selectedId] : undefined;

  const goalLabel = GOALS.find((g) => g.value === values?.input.goal)?.label ?? GOALS[0].label;
  const pending = search.status === "loading";
  const blocked = Boolean(retryIn);
  const emptyList = useMemo(() => [], []);

  const map = (
    <MeetingMap
      initialCenter={initialCenter}
      participants={placedCoordinates}
      people={placedPeople}
      results={points.length ? points : emptyList}
      selectedId={selectedId}
      onSelect={select}
      isochrone={iso.status === "ready" && iso.pointId === selectedId ? iso.geometry : null}
      places={selectedPlaces}
      debugCandidates={debug && search.status === "success" ? search.result.debugCandidates : undefined}
      bottomInset={sheetInsetPx(snap, viewport)}
    />
  );

  const summary = (
    <PeekSummary
      state={search}
      selected={selectedPoint ? { rank: selectedIndex + 1, point: selectedPoint } : null}
      isochrone={iso.status}
      retryIn={retryIn}
      canSubmit={canSubmit}
      pending={pending}
      formId={formId}
      onExpand={() => {
        focusAfterSnap.current = () => formControl('[role="combobox"]')?.focus();
        setSnap("half");
      }}
      textRef={summaryTextRef}
    />
  );

  return (
    <AppShell
      map={map}
      snap={snap}
      onSnapChange={setSnap}
      summary={summary}
      live={
        // Outside the sheet: its body is display:none at peek, which is
        // exactly when isochrone updates happen.
        <p className="visually-hidden" role="status" aria-live="polite" data-announcer="">
          {announcement}
        </p>
      }
    >
      <MeetingForm
        formId={formId}
        pending={pending}
        blocked={blocked}
        onSubmit={(next) => void runSearch(next)}
        onCanSubmitChange={setCanSubmit}
        onPlacesChange={setPlaced}
        onInvalid={() => flushSync(() => setSnap((s) => (s === "peek" ? "half" : s)))}
      />
      <ResultsPanel
        state={search}
        people={values?.people ?? emptyList}
        selectedId={selectedId}
        onSelect={select}
        onRetry={() => {
          if (values) void runSearch(values);
        }}
        retryIn={retryIn}
        goalLabel={goalLabel}
        isochrone={isochroneView}
        places={placesById}
        debugCount={debug && search.status === "success" ? search.result.debugCandidates.length : null}
        headingRef={headingRef}
      />
    </AppShell>
  );
}
