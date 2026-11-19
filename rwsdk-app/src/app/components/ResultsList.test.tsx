import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ScoredCandidate } from "@/domain/scoring";
import type { PersonSummary } from "./participants";
import { ResultsList } from "./ResultsList";
import { ResultsPanel, type ResultsPanelProps } from "./ResultsPanel";

const people: PersonSummary[] = [
  { slot: 0, name: "Ana", initial: "A", label: "Carrow Road, Norwich" },
  { slot: 1, name: "Ben", initial: "B", label: "Mill Lane, Cambridge" },
  { slot: 2, name: "Cleo", initial: "C", label: "High Street, Oxford" },
];

function point(id: string, perPersonSeconds: number[]): ScoredCandidate {
  const total = perPersonSeconds.reduce((a, b) => a + b, 0);
  return {
    id,
    coordinate: { lat: 52 + Number(id.slice(1)) / 100, lng: 0.5 },
    kind: "GRID",
    perPersonSeconds,
    max: Math.max(...perPersonSeconds),
    mean: total / perPersonSeconds.length,
    total,
    variance: 0,
    score: Math.max(...perPersonSeconds),
  };
}

// Server order is the ranking. Times in seconds.
const results = [
  point("g1", [34 * 60, 36 * 60, 38 * 60]), // longest 38
  point("g2", [20 * 60, 40 * 60, 30 * 60]), // longest 40
  point("g3", [45 * 60, 10 * 60, 44 * 60]), // longest 45 (scale max)
];

const items = () => within(screen.getByRole("list", { name: "Meeting points" })).getAllByRole("listitem", {
  name: (_n, el) => el.classList.contains("result"),
});
const resultButtons = () => screen.getAllByRole("button", { name: /^Meeting point \d/ });

describe("ResultsList", () => {
  it("renders an ordered list in the server's ranking order, with rank and longest/average times", () => {
    render(<ResultsList results={results} people={people} selectedId={null} onSelect={() => {}} />);
    const list = screen.getByRole("list", { name: "Meeting points" });
    expect(list.tagName).toBe("OL");
    expect(items()).toHaveLength(3);
    expect(resultButtons().map((b) => b.textContent)).toEqual([
      expect.stringMatching(/Meeting point 1.*Longest trip 38 min.*Average 36 min/),
      expect.stringMatching(/Meeting point 2.*Longest trip 40 min.*Average 30 min/),
      expect.stringMatching(/Meeting point 3.*Longest trip 45 min.*Average 33 min/),
    ]);
  });

  it("shows each person's time as text, with the longest one labelled", () => {
    render(<ResultsList results={results} people={people} selectedId={null} onSelect={() => {}} />);
    const strip = screen.getAllByRole("list", { name: "Travel time for each person" })[0];
    const rows = within(strip).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      "Ana34 min",
      "Ben36 min",
      "Cleo38 min(longest)",
    ]);
    expect(rows[2].getAttribute("data-longest")).toBe("true");
    expect(rows[0].getAttribute("data-longest")).toBeNull();
  });

  it("draws every strip on the same time scale across all results", () => {
    const { container } = render(
      <ResultsList results={results} people={people} selectedId={null} onSelect={() => {}} />,
    );
    const widths = Array.from(container.querySelectorAll<HTMLElement>(".strip__fill")).map(
      (el) => el.style.width,
    );
    // scale = 45 min (the largest time in ANY result)
    expect(widths.slice(0, 3)).toEqual([`${(34 / 45) * 100}%`, `${(36 / 45) * 100}%`, `${(38 / 45) * 100}%`]);
    expect(widths[6]).toBe("100%");
  });

  it("calls onSelect with the point, by click and by keyboard, and marks the selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { rerender } = render(
      <ResultsList results={results} people={people} selectedId={null} onSelect={onSelect} />,
    );
    await user.click(resultButtons()[1]);
    expect(onSelect).toHaveBeenLastCalledWith(results[1]);

    resultButtons()[2].focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenLastCalledWith(results[2]);
    await user.keyboard(" ");
    expect(onSelect).toHaveBeenCalledTimes(3);

    rerender(<ResultsList results={results} people={people} selectedId="g2" onSelect={onSelect} />);
    expect(resultButtons().map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
    expect(items()[1].getAttribute("data-selected")).toBe("true");
  });

  it("shows isochrone loading, ready and error states on the selected row only", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const base = { results, people, selectedId: "g1", onSelect: () => {} };
    const { rerender } = render(
      <ResultsList {...base} isochrone={{ pointId: "g1", status: "loading", minutes: 10, modeLabel: "car", onRetry }} />,
    );
    expect(within(items()[0]).getByText("Loading reachable area")).toBeTruthy();
    expect(within(items()[1]).queryByText("Loading reachable area")).toBeNull();

    rerender(
      <ResultsList {...base} isochrone={{ pointId: "g1", status: "ready", minutes: 10, modeLabel: "car", onRetry }} />,
    );
    expect(within(items()[0]).getByText("The map shades everywhere within 10 min of here by car.")).toBeTruthy();

    rerender(
      <ResultsList
        {...base}
        isochrone={{ pointId: "g1", status: "error", minutes: 10, modeLabel: "car", onRetry, message: "The route service has reached its daily limit. Try again later." }}
      />,
    );
    const row = items()[0];
    expect(within(row).getByText(/couldn't load the reachable area/)).toBeTruthy();
    expect(within(row).getByText(/daily limit/)).toBeTruthy();
    await user.click(within(row).getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    // results are still all there
    expect(items()).toHaveLength(3);
  });
});

function panel(props: Partial<ResultsPanelProps>) {
  const all: ResultsPanelProps = {
    state: { status: "idle" },
    people,
    selectedId: null,
    onSelect: () => {},
    onRetry: () => {},
    retryIn: null,
    goalLabel: "Fairest for everyone",
    ...props,
  };
  return render(<ResultsPanel {...all} />);
}

describe("ResultsPanel states", () => {
  it("renders nothing before the first search", () => {
    const { container } = panel({});
    expect(container.textContent).toBe("");
  });

  it("shows skeleton rows that keep the layout while loading", () => {
    const { container } = panel({ state: { status: "loading" } });
    const region = screen.getByRole("region", { name: "Meeting points" });
    expect(region.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelectorAll(".result--skeleton")).toHaveLength(3);
    expect(container.querySelectorAll(".result--skeleton .strip__track").length).toBeGreaterThan(0);
  });

  it("shows the ranked list on success", () => {
    panel({ state: { status: "success", result: { points: results, candidatesEvaluated: 40, matrixCalls: 1, debugCandidates: [] } } });
    expect(resultButtons()).toHaveLength(3);
    expect(screen.getByText(/Ranked by fairest for everyone/)).toBeTruthy();
  });

  const cases = [
    ["no_reachable_point", "No place is reachable for everyone by this travel mode. Try another mode or move a start point."],
    ["quota", "The route service has reached its daily limit. Try again later."],
    ["upstream", "Something went wrong on our side. Try again."],
    ["validation", "This request is too large for the routing service."],
  ] as const;

  it.each(cases)("error %s renders its own message in an alert", (code, message) => {
    panel({ state: { status: "error", error: { code, message: "This request is too large for the routing service." } } });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(message);
  });

  it("offers Retry only for the generic error", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = panel({ state: { status: "error", error: { code: "upstream", message: "x" } }, onRetry });
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    for (const code of ["quota", "no_reachable_point", "validation"] as const) {
      rerender(
        <ResultsPanel
          state={{ status: "error", error: { code, message: "x" } }}
          people={people}
          selectedId={null}
          onSelect={() => {}}
          onRetry={onRetry}
          retryIn={null}
          goalLabel="Fairest for everyone"
        />,
      );
      expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    }
  });

  it("rate_limited: shows a visible countdown but announces the sentence only once", () => {
    const error = { code: "rate_limited" as const, message: "x", retryAfterSeconds: 3 };
    const { rerender } = panel({ state: { status: "error", error }, retryIn: 3 });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("You're searching too fast. Try again in 3 seconds.");
    const announced = alert.querySelector(".visually-hidden")!.textContent;
    expect(alert.querySelector("[aria-hidden='true'].countdown")!.textContent).toBe(
      "You're searching too fast. Try again in 3 seconds.",
    );

    rerender(
      <ResultsPanel
        state={{ status: "error", error }}
        people={people}
        selectedId={null}
        onSelect={() => {}}
        onRetry={() => {}}
        retryIn={2}
        goalLabel="Fairest for everyone"
      />,
    );
    const again = screen.getByRole("alert");
    expect(again.querySelector("[aria-hidden='true'].countdown")!.textContent).toBe(
      "You're searching too fast. Try again in 2 seconds.",
    );
    // the announced (non-hidden) text did not change, so it is not re-read every second
    expect(again.querySelector(".visually-hidden")!.textContent).toBe(announced);

    rerender(
      <ResultsPanel
        state={{ status: "error", error }}
        people={people}
        selectedId={null}
        onSelect={() => {}}
        onRetry={() => {}}
        retryIn={0}
        goalLabel="Fairest for everyone"
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("You can search again now.");
  });

  it("shows the debug candidate count only when given", () => {
    const state = { status: "success" as const, result: { points: results, candidatesEvaluated: 40, matrixCalls: 1 as const, debugCandidates: [] } };
    const { rerender } = panel({ state });
    expect(screen.queryByText(/candidate points/)).toBeNull();
    rerender(
      <ResultsPanel
        state={state}
        people={people}
        selectedId={null}
        onSelect={() => {}}
        onRetry={() => {}}
        retryIn={null}
        goalLabel="Fairest for everyone"
        debugCount={40}
      />,
    );
    expect(screen.getByText("Debug: the map shows all 40 candidate points.")).toBeTruthy();
  });
});
