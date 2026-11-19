"use client";

import {
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

export interface BottomSheetProps {
  /** Id of the heading that names the panel region. */
  labelledBy: string;
  children: ReactNode;
  /** Uncontrolled initial snap. */
  defaultSnap?: SheetSnap;
  /** Controlled snap (e.g. selecting a result snaps to "peek"). */
  snap?: SheetSnap;
  onSnapChange?: (snap: SheetSnap) => void;
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
 * swipe on the handle steps in the swipe direction.
 */
export function BottomSheet({
  labelledBy,
  children,
  defaultSnap = "half",
  snap: controlledSnap,
  onSnapChange,
}: BottomSheetProps) {
  const [uncontrolledSnap, setUncontrolledSnap] = useState<SheetSnap>(defaultSnap);
  const snap = controlledSnap ?? uncontrolledSnap;
  const bodyId = `sheet${useId().replace(/:/g, "")}-body`;
  const pointerStart = useRef<number | null>(null);
  const suppressClick = useRef(false);

  const setSnap = (next: SheetSnap) => {
    if (controlledSnap === undefined) setUncontrolledSnap(next);
    onSnapChange?.(next);
  };

  const onClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setSnap(nextSnap(snap));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
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
    suppressClick.current = false;
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (pointerStart.current === null) return;
    const dy = event.clientY - pointerStart.current;
    pointerStart.current = null;
    if (Math.abs(dy) >= SWIPE_THRESHOLD) {
      suppressClick.current = true;
      setSnap(stepSnap(snap, dy < 0 ? 1 : -1));
    }
  };

  return (
    <section className="sheet" data-snap={snap} aria-labelledby={labelledBy}>
      <button
        type="button"
        className="sheet__handle"
        aria-label={HANDLE_LABEL[snap]}
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
      <div className="sheet__body" id={bodyId}>
        {children}
      </div>
    </section>
  );
}
