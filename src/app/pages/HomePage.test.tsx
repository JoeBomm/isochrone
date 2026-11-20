import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScoredCandidate } from "@/domain/scoring";

const mapProps = vi.hoisted(() => ({ last: null as null | Record<string, any> }));
const fakeForm = vi.hoisted(() => ({ canSubmit: true }));

vi.mock("@/server/actions", () => ({
  findMeetingPointsAction: vi.fn(),
  getIsochroneAction: vi.fn(),
  geocodeAction: vi.fn(),
}));

// Leaflet never runs in jsdom: the map is replaced by a probe that records its props.
vi.mock("@/app/components/MeetingMap", () => ({
  MeetingMap: (props: Record<string, any>) => {
    mapProps.last = props;
    return (
      <div data-testid="map">
        {props.results.map((r: ScoredCandidate, i: number) => (
          <button key={r.id} type="button" onClick={() => props.onSelect(r)}>
            Map marker {i + 1}
          </button>
        ))}
      </div>
    );
  },
}));

// The real form needs geocoding to resolve people; it is tested on its own.
// This stand-in has the same props contract.
vi.mock("@/app/components/MeetingForm", () => ({
  MeetingForm: (props: Record<string, any>) => {
    useEffect(() => props.onCanSubmitChange?.(fakeForm.canSubmit), []);
    return (
      <form
        id={props.formId}
        onSubmit={(e) => {
          e.preventDefault();
          if (props.pending || props.blocked) return;
          props.onSubmit(VALUES);
        }}
      >
        <input role="combobox" aria-label="Starting address for Person 1" />
        <button type="submit" aria-disabled={props.blocked || undefined} aria-busy={props.pending || undefined}>
          {props.pending ? "Finding meeting points" : "Find meeting points"}
        </button>
      </form>
    );
  },
}));

import { findMeetingPointsAction, getIsochroneAction } from "@/server/actions";
import { HomePage } from "./HomePage";

const find = vi.mocked(findMeetingPointsAction);
const iso = vi.mocked(getIsochroneAction);

const VALUES = {
  input: {
    participants: [
      { lat: 52.62, lng: 1.3 },
      { lat: 52.2, lng: 0.12 },
    ],
    mode: "cycling-regular" as const,
    goal: "MINIMAX" as const,
  },
  isochroneMinutes: 15,
  people: [
    { slot: 0, name: "Ana", initial: "A", label: "Norwich" },
    { slot: 1, name: "Ben", initial: "B", label: "Cambridge" },
  ],
};

function point(id: string, a: number, b: number, lat: number): ScoredCandidate {
  return {
    id,
    coordinate: { lat, lng: 0.7 },
    kind: "GRID",
    perPersonSeconds: [a, b],
    max: Math.max(a, b),
    mean: (a + b) / 2,
    total: a + b,
    variance: 0,
    score: Math.max(a, b),
  };
}

const POINTS = [point("g1", 1800, 2000, 52.4), point("g2", 1500, 2400, 52.3), point("g3", 900, 2700, 52.5)];
const DEBUG = [
  { id: "c1", coordinate: { lat: 52.4, lng: 0.7 }, kind: "ANCHOR" as const },
  { id: "c2", coordinate: { lat: 52.5, lng: 0.8 }, kind: "GRID" as const },
];
const SUCCESS = {
  ok: true as const,
  data: { points: POINTS, candidatesEvaluated: 52, matrixCalls: 1 as const, debugCandidates: DEBUG },
};
const polygon = (n: number) => ({ type: "Polygon" as const, coordinates: [[[n, 52], [n + 0.1, 52.1], [n, 52]]] });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type FindReturn = Awaited<ReturnType<typeof findMeetingPointsAction>>;
type IsoReturn = Awaited<ReturnType<typeof getIsochroneAction>>;

/** Simulate the < 960px layout (bottom sheet) or the desktop side panel. */
function layout(kind: "mobile" | "desktop") {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: kind === "desktop" && query.includes("min-width"),
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList,
  );
}

beforeEach(() => {
  fakeForm.canSubmit = true;
  find.mockReset();
  iso.mockReset();
  mapProps.last = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const submit = () => screen.getAllByRole("button", { name: "Find meeting points" })[0];
const resultButtons = () => screen.getAllByRole("button", { name: /^Meeting point \d/ });
const sheet = () => document.querySelector(".sheet") as HTMLElement;

async function searchOk(user: ReturnType<typeof userEvent.setup>) {
  find.mockResolvedValueOnce(SUCCESS);
  await user.click(submit());
  await screen.findByRole("list", { name: "Meeting points" });
}

describe("HomePage: search states", () => {
  it("starts empty, then loading, then shows ranked results and hands them to the map", async () => {
    const user = userEvent.setup();
    const pending = deferred<FindReturn>();
    find.mockReturnValueOnce(pending.promise);
    render(<HomePage debug={false} />);

    expect(screen.queryByRole("region", { name: "Meeting points" })).toBeNull();
    expect(mapProps.last!.results).toEqual([]);

    await user.click(submit());
    expect(find).toHaveBeenCalledWith(VALUES.input);
    const region = screen.getByRole("region", { name: "Meeting points" });
    expect(region.getAttribute("aria-busy")).toBe("true");
    expect(screen.getAllByText("Finding meeting points").length).toBeGreaterThan(0);

    await act(async () => pending.resolve(SUCCESS));
    expect(region.getAttribute("aria-busy")).toBe("false");
    expect(resultButtons()).toHaveLength(3);
    expect(mapProps.last!.results).toEqual(POINTS);
    expect(mapProps.last!.participants).toEqual(VALUES.input.participants);
    expect(mapProps.last!.people).toEqual(VALUES.people);
    expect(mapProps.last!.debugCandidates).toBeUndefined();
    // focus moves to the results heading so the outcome is announced
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Meeting points" }));
  });

  it("shows each server error code's own message", async () => {
    const user = userEvent.setup();
    render(<HomePage debug={false} />);
    find.mockResolvedValueOnce({ ok: false, error: { code: "no_reachable_point", message: "x" } });
    await user.click(submit());
    expect((await screen.findByRole("alert")).textContent).toContain("No place is reachable for everyone");

    find.mockResolvedValueOnce({ ok: false, error: { code: "quota", message: "x" } });
    await user.click(submit());
    expect((await screen.findByRole("alert")).textContent).toContain("reached its daily limit");
  });

  it("scrolls an error into view without moving focus", async () => {
    const user = userEvent.setup();
    const scrolled: Element[] = [];
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
      scrolled.push(this);
    };
    try {
      render(<HomePage debug={false} />);
      find.mockResolvedValueOnce({ ok: false, error: { code: "quota", message: "x" } });
      await user.click(submit());
      await screen.findByRole("alert");
      expect(scrolled).toContain(screen.getByRole("heading", { name: "Meeting points" }));
      expect(document.activeElement).toBe(submit());
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it("treats a thrown call as the generic error, and Retry repeats the same search", async () => {
    const user = userEvent.setup();
    render(<HomePage debug={false} />);
    find.mockRejectedValueOnce(new Error("Server function returned status 500"));
    await user.click(submit());
    expect((await screen.findByRole("alert")).textContent).toContain("Something went wrong on our side. Try again.");

    find.mockResolvedValueOnce(SUCCESS);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(find).toHaveBeenCalledTimes(2);
    expect(find).toHaveBeenLastCalledWith(VALUES.input);
    expect(await screen.findAllByRole("button", { name: /^Meeting point \d/ })).toHaveLength(3);
  });

  it("rate_limited: counts down and re-enables the submit button", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<HomePage debug={false} />);
    find.mockResolvedValueOnce({ ok: false, error: { code: "rate_limited", message: "x", retryAfterSeconds: 3 } });
    await user.click(submit());
    await act(async () => {});
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Try again in 3 seconds.");
    // the peek button is unavailable but stays focusable (aria-disabled, not disabled)
    expect((submit() as HTMLButtonElement).disabled).toBe(false);
    expect(submit().getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(submit());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByRole("alert").textContent).toContain("Try again in 2 seconds.");
    expect(submit().getAttribute("aria-disabled")).toBe("true");
    await user.keyboard("{Enter}"); // blocked: no new search
    expect(find).toHaveBeenCalledTimes(1);

    // one tick per second (each tick schedules the next after React commits)
    for (let i = 0; i < 2; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    expect(screen.queryByRole("alert")).toBeNull();
    const region = screen.getByRole("region", { name: "Meeting points" });
    expect(within(region).getByRole("status").textContent).toContain("You can search again now.");
    expect(submit().hasAttribute("aria-disabled")).toBe(false);
  });
});

describe("HomePage: selecting a result", () => {
  it("asks for the isochrone with the point, mode and minutes, shows loading, then the polygon", async () => {
    const user = userEvent.setup();
    render(<HomePage debug={false} />);
    await searchOk(user);
    const pending = deferred<IsoReturn>();
    iso.mockReturnValueOnce(pending.promise);

    await user.click(resultButtons()[1]);
    expect(iso).toHaveBeenCalledWith({ center: POINTS[1].coordinate, minutes: 15, mode: "cycling-regular" });
    expect(mapProps.last!.selectedId).toBe("g2");
    expect(mapProps.last!.isochrone).toBeNull();
    expect(screen.getAllByText("Loading reachable area").length).toBeGreaterThan(0);
    // selecting snaps the mobile sheet to peek, where the summary shows the selection and the primary action
    expect(sheet().getAttribute("data-snap")).toBe("peek");
    const summary = document.querySelector(".sheet__summary") as HTMLElement;
    expect(summary.textContent).toContain("Meeting point 2 of 3");
    expect(within(summary).getByRole("button", { name: "Find meeting points" }).getAttribute("form")).toBeTruthy();

    await act(async () => pending.resolve({ ok: true, data: { geometry: polygon(1) } }));
    expect(mapProps.last!.isochrone).toEqual(polygon(1));
    expect(screen.getByText("The map shades everywhere within 15 min of here by bike.")).toBeTruthy();
  });

  it("selecting from the map works the same way", async () => {
    const user = userEvent.setup();
    render(<HomePage debug={false} />);
    await searchOk(user);
    iso.mockResolvedValueOnce({ ok: true, data: { geometry: polygon(3) } });
    await user.click(screen.getByRole("button", { name: "Map marker 3" }));
    expect(iso).toHaveBeenCalledWith({ center: POINTS[2].coordinate, minutes: 15, mode: "cycling-regular" });
    expect(resultButtons()[2].getAttribute("aria-pressed")).toBe("true");
  });

  it("ignores an out-of-order isochrone response (select A, then B, A answers last)", async () => {
    const user = userEvent.setup();
    render(<HomePage debug={false} />);
    await searchOk(user);
    const a = deferred<IsoReturn>();
    const b = deferred<IsoReturn>();
    iso.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);

    await user.click(resultButtons()[0]);
    await user.click(resultButtons()[1]);
    await act(async () => b.resolve({ ok: true, data: { geometry: polygon(2) } }));
    expect(mapProps.last!.isochrone).toEqual(polygon(2));
    await act(async () => a.resolve({ ok: true, data: { geometry: polygon(1) } }));
    expect(mapProps.last!.selectedId).toBe("g2");
    expect(mapProps.last!.isochrone).toEqual(polygon(2));
    expect(resultButtons()[1].getAttribute("aria-pressed")).toBe("true");
  });

  it("also ignores a stale error and a stale loading state", async () => {
    const user = userEvent.setup();
    render(<HomePage debug={false} />);
    await searchOk(user);
    const a = deferred<IsoReturn>();
    iso.mockReturnValueOnce(a.promise).mockResolvedValueOnce({ ok: true, data: { geometry: polygon(2) } });
    await user.click(resultButtons()[0]);
    await user.click(resultButtons()[1]);
    await act(async () => a.resolve({ ok: false, error: { code: "upstream", message: "x" } }));
    expect(within(screen.getByRole("list", { name: "Meeting points" })).queryByText(/couldn't load/)).toBeNull();
    expect(mapProps.last!.isochrone).toEqual(polygon(2));
  });

  it("shows an isochrone error inline without clearing the results, and can retry", async () => {
    const user = userEvent.setup();
    render(<HomePage debug={false} />);
    await searchOk(user);
    iso.mockResolvedValueOnce({ ok: false, error: { code: "quota", message: "x" } });
    await user.click(resultButtons()[0]);
    const list = () => screen.getByRole("list", { name: "Meeting points" });
    expect(await within(list()).findByText(/couldn't load the reachable area/)).toBeTruthy();
    expect(within(list()).getByText(/reached its daily limit/)).toBeTruthy();
    // the collapsed (peek) sheet says so too, since the list is hidden there
    expect(document.querySelector(".sheet__summary")!.textContent).toContain(
      "Meeting point 1 of 3. We couldn't load the reachable area.",
    );
    expect(resultButtons()).toHaveLength(3);
    expect(mapProps.last!.results).toEqual(POINTS);

    iso.mockRejectedValueOnce(new Error("network"));
    await user.click(screen.getByRole("button", { name: "Try again" }));
    // a generic failure does not repeat "Try again" in the text (the button says it)
    await within(list()).findByText("We couldn't load the reachable area.");
    expect(within(list()).queryByText(/daily limit/)).toBeNull();

    iso.mockResolvedValueOnce({ ok: true, data: { geometry: polygon(5) } });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await act(async () => {});
    expect(mapProps.last!.isochrone).toEqual(polygon(5));
  });

  it("re-selecting a loaded point reuses its polygon without another request", async () => {
    const user = userEvent.setup();
    render(<HomePage debug={false} />);
    await searchOk(user);
    iso.mockResolvedValueOnce({ ok: true, data: { geometry: polygon(1) } });
    iso.mockResolvedValueOnce({ ok: true, data: { geometry: polygon(2) } });
    await user.click(resultButtons()[0]);
    await act(async () => {});
    await user.click(resultButtons()[1]);
    await act(async () => {});
    await user.click(resultButtons()[0]);
    expect(iso).toHaveBeenCalledTimes(2);
    expect(mapProps.last!.isochrone).toEqual(polygon(1));
  });

  it("a new search clears the selection and polygon", async () => {
    const user = userEvent.setup();
    render(<HomePage debug={false} />);
    await searchOk(user);
    iso.mockResolvedValueOnce({ ok: true, data: { geometry: polygon(1) } });
    await user.click(resultButtons()[0]);
    await act(async () => {});
    find.mockResolvedValueOnce(SUCCESS);
    await user.click(submit());
    await act(async () => {});
    expect(mapProps.last!.selectedId).toBeNull();
    expect(mapProps.last!.isochrone).toBeNull();
  });

  it("does not update state after unmount (in-flight isochrone and search)", async () => {
    const user = userEvent.setup();
    const errors = vi.spyOn(console, "error");
    const { unmount } = render(<HomePage debug={false} />);
    await searchOk(user);
    const a = deferred<IsoReturn>();
    iso.mockReturnValueOnce(a.promise);
    await user.click(resultButtons()[0]);
    unmount();
    await act(async () => a.resolve({ ok: true, data: { geometry: polygon(1) } }));
    expect(errors).not.toHaveBeenCalled();
  });
});

describe("HomePage: ?debug=1 hypothesis layer", () => {
  it("passes the candidate points to the map only in debug mode", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<HomePage debug={false} />);
    await searchOk(user);
    expect(mapProps.last!.debugCandidates).toBeUndefined();
    expect(screen.queryByText(/candidate points/)).toBeNull();
    unmount();

    render(<HomePage debug />);
    await searchOk(user);
    expect(mapProps.last!.debugCandidates).toEqual(DEBUG);
    expect(screen.getByText("Debug: the map shows all 2 candidate points.")).toBeTruthy();
  });
});

describe("HomePage: announcements and focus with the mobile sheet", () => {
  const liveRegion = () => document.querySelector("[data-announcer]") as HTMLElement;

  it("announces isochrone status from a live region outside the sheet body (hidden at peek)", async () => {
    const user = userEvent.setup();
    render(<HomePage debug={false} />);
    // present from the first render, so later text changes are announced
    expect(liveRegion()).toBeTruthy();
    expect(liveRegion().getAttribute("role")).toBe("status");
    expect(liveRegion().closest(".sheet__body")).toBeNull();
    expect(liveRegion().closest(".sheet")).toBeNull();

    await searchOk(user);
    const pending = deferred<IsoReturn>();
    iso.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ ok: false, error: { code: "upstream", message: "x" } });
    await user.click(resultButtons()[0]);
    expect(liveRegion().textContent).toBe("Loading reachable area.");
    await act(async () => pending.resolve({ ok: true, data: { geometry: polygon(1) } }));
    expect(liveRegion().textContent).toBe("The map shows everywhere within 15 minutes of the meeting point.");
    await user.click(screen.getByRole("button", { name: "Map marker 2" }));
    await act(async () => {});
    expect(liveRegion().textContent).toBe("We couldn't load the reachable area.");
  });

  it("mobile: selecting from the list moves focus to the peek summary (the row is hidden at peek)", async () => {
    layout("mobile");
    const user = userEvent.setup();
    render(<HomePage debug={false} />);
    await searchOk(user);
    iso.mockResolvedValueOnce({ ok: true, data: { geometry: polygon(1) } });
    await user.click(resultButtons()[1]);
    expect(sheet().getAttribute("data-snap")).toBe("peek");
    const summaryText = document.querySelector(".sheet__summary .peek__text") as HTMLElement;
    expect(document.activeElement).toBe(summaryText);
    expect(summaryText.textContent).toContain("Meeting point 2 of 3");
  });

  it("mobile: selecting from the map keeps focus on the marker; desktop keeps focus on the row", async () => {
    layout("mobile");
    const user = userEvent.setup();
    const { unmount } = render(<HomePage debug={false} />);
    await searchOk(user);
    iso.mockResolvedValue({ ok: true, data: { geometry: polygon(1) } });
    const marker = screen.getByRole("button", { name: "Map marker 1" });
    await user.click(marker);
    expect(document.activeElement).toBe(marker);
    unmount();

    layout("desktop");
    render(<HomePage debug={false} />);
    await searchOk(user);
    await user.click(resultButtons()[2]);
    expect(document.activeElement).toBe(resultButtons()[2]);
  });

  it("submitting from the peek summary: focus moves to the form's submit button, and stays there on error", async () => {
    layout("mobile");
    const user = userEvent.setup();
    render(<HomePage debug={false} />);
    await searchOk(user);
    iso.mockResolvedValueOnce({ ok: true, data: { geometry: polygon(1) } });
    await user.click(resultButtons()[0]); // snaps to peek
    const peekButton = within(document.querySelector(".sheet__summary") as HTMLElement).getByRole("button", {
      name: "Find meeting points",
    });
    find.mockResolvedValueOnce({ ok: false, error: { code: "quota", message: "x" } });
    await user.click(peekButton);
    const formButton = document.querySelector("form button[type=submit]") as HTMLElement;
    expect(sheet().getAttribute("data-snap")).toBe("half");
    expect(document.activeElement).toBe(formButton);
    await screen.findByRole("alert");
    expect(document.activeElement).toBe(formButton);
  });

  it("Add people (peek, nobody resolved) expands the sheet and focuses the first address field", async () => {
    layout("mobile");
    fakeForm.canSubmit = false;
    const user = userEvent.setup();
    render(<HomePage debug={false} />);
    await user.click(screen.getByRole("button", { name: "Expand panel to full screen" })); // half -> full
    await user.click(screen.getByRole("button", { name: "Collapse panel" })); // full -> peek
    await user.click(screen.getByRole("button", { name: "Add people" }));
    expect(sheet().getAttribute("data-snap")).toBe("half");
    expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Starting address for Person 1" }));
  });
});

