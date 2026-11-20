"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

export type SheetSnap = "peek" | "half" | "full";

export const SNAP_ORDER: readonly SheetSnap[] = ["peek", "half", "full"];

/** Next snap when the handle is activated: peek -> half -> full -> peek. */
export function nextSnap(snap: SheetSnap): SheetSnap {
  return SNAP_ORDER[(SNAP_ORDER.indexOf(snap) + 1) % SNAP_ORDER.length];
}

function stepSnap(snap: SheetSnap, delta: 1 | -1): SheetSnap {
  const index = Math.min(
    SNAP_ORDER.length - 1,
    Math.max(0, SNAP_ORDER.indexOf(snap) + delta),
  );
  return SNAP_ORDER[index];
}

const HANDLE_LABEL: Record<SheetSnap, string> = {
  peek: "Expand panel",
  half: "Expand panel to full screen",
  full: "Collapse panel",
};

/** Pointer travel (px) that counts as a swipe rather than a tap. */
const SWIPE_THRESHOLD = 32;

/**
 * How long after a swipe a click is treated as the swipe's own click. The
 * browser fires that click immediately after pointerup (or not at all, e.g.
 * when the pointer left the handle), so this only needs to be short.
 */
const SWIPE_CLICK_WINDOW_MS = 400;

export interface BottomSheetProps {
  /** Id of the heading that names the panel region. */
  labelledBy: string;
  children: ReactNode;
  /** Uncontrolled initial snap. */
  defaultSnap?: SheetSnap;
  /** Controlled snap (e.g. selecting a result snaps to "peek"). */
  snap?: SheetSnap;
  onSnapChange?: (snap: SheetSnap) => void;
  /**
   * Shown instead of the body while the mobile sheet is at peek (shell.css):
   * a short status plus the primary action, so the collapsed sheet is still
   * useful. Not shown on desktop, where the body is always visible. At peek
   * the body is hidden (display: none), which matches aria-expanded=false.
   */
  summary?: ReactNode;
}

/**
 * Controls panel. On narrow screens (< 960px, see shell.css) it is a bottom
 * sheet with three snap heights; at >= 960px CSS turns it into the static side
 * panel and hides the handle, so the same children render once.
 *
 * The sheet changes height (not transform), and its body scrolls, so content
 * below the fold is still reachable and focusing it scrolls it into view.
 *
 * Handle: a real <button>. Enter/Space (native click) cycles
 * peek -> half -> full -> peek; ArrowUp/ArrowDown step up/down; a vertical
 * swipe on the handle steps in the swipe direction (the pointer is captured
 * so the release is seen even off the handle).
 *
 * aria-expanded is false only at peek. The click that ends a swipe is
 * suppressed so the swipe does not also cycle; that flag is cleared by any
 * keydown and after SWIPE_CLICK_WINDOW_MS, so it cannot swallow a later
 * keyboard activation.
 */
export function BottomSheet({
  labelledBy,
  children,
  defaultSnap = "half",
  snap: controlledSnap,
  onSnapChange,
  summary,
}: BottomSheetProps) {
  const [uncontrolledSnap, setUncontrolledSnap] = useState<SheetSnap>(defaultSnap);
  const snap = controlledSnap ?? uncontrolledSnap;
  const bodyId = `sheet${useId().replace(/:/g, "")}-body`;
  const pointerStart = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const suppressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSuppress = () => {
    suppressClick.current = false;
    if (suppressTimer.current !== null) {
      clearTimeout(suppressTimer.current);
      suppressTimer.current = null;
    }
  };

  useEffect(() => clearSuppress, []);

  const setSnap = (next: SheetSnap) => {
    if (controlledSnap === undefined) setUncontrolledSnap(next);
    onSnapChange?.(next);
  };

  const onClick = () => {
    if (suppressClick.current) {
      clearSuppress();
      return;
    }
    setSnap(nextSnap(snap));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    clearSuppress();
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSnap(stepSnap(snap, 1));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setSnap(stepSnap(snap, -1));
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    pointerStart.current = event.clientY;
    clearSuppress();
    // Keep receiving pointerup even if the finger leaves the handle.
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Not an active pointer (synthetic events): swiping still works on the handle.
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (pointerStart.current === null) return;
    const dy = event.clientY - pointerStart.current;
    pointerStart.current = null;
    if (Math.abs(dy) >= SWIPE_THRESHOLD) {
      suppressClick.current = true;
      suppressTimer.current = setTimeout(clearSuppress, SWIPE_CLICK_WINDOW_MS);
      setSnap(stepSnap(snap, dy < 0 ? 1 : -1));
    }
  };

  return (
    <section
      className="sheet"
      data-snap={snap}
      data-summary={summary ? "" : undefined}
      aria-labelledby={labelledBy}
    >
      <button
        type="button"
        className="sheet__handle"
        aria-label={HANDLE_LABEL[snap]}
        aria-expanded={snap !== "peek"}
        aria-controls={bodyId}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          pointerStart.current = null;
        }}
      >
        <span className="sheet__grip" aria-hidden="true" />
      </button>
      {summary ? <div className="sheet__summary">{summary}</div> : null}
      <div className="sheet__body" id={bodyId}>
        {children}
      </div>
    </section>
  );
}
