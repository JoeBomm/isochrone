import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_PARTICIPANTS } from "@/domain/constants";

vi.mock("@/server/actions", () => ({ geocodeAction: vi.fn() }));

import { geocodeAction } from "@/server/actions";
import { MeetingForm } from "./MeetingForm";
import type { MeetingFormValues } from "./participants";

const geocode = vi.mocked(geocodeAction);

const PLACES: Record<string, { lat: number; lng: number; label: string }> = {
  "Carrow Road": { lat: 52.622, lng: 1.309, label: "Carrow Road, Norwich, England" },
  "Mill Lane": { lat: 52.2, lng: 0.12, label: "Mill Lane, Cambridge, England" },
  "High Street": { lat: 51.75, lng: -1.25, label: "High Street, Oxford, England" },
};

function ok(...labels: string[]) {
  return {
    ok: true as const,
    data: {
      results: labels.map((l) => ({
        coordinate: { lat: PLACES[l].lat, lng: PLACES[l].lng },
        label: PLACES[l].label,
      })),
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  geocode.mockReset();
  geocode.mockImplementation(async (q: string) => {
    const hit = Object.keys(PLACES).find((k) => k.toLowerCase() === q.toLowerCase());
    return hit
      ? ok(hit)
      : { ok: false as const, error: { code: "not_found" as const, message: "No matching places found." } };
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function setup(props: Partial<Parameters<typeof MeetingForm>[0]> = {}) {
  const onSubmit = vi.fn<(values: MeetingFormValues) => void>();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const utils = render(<MeetingForm onSubmit={onSubmit} pending={false} {...props} />);
  return { ...utils, user, onSubmit };
}

/** Run the 300ms debounce and let the mocked server call resolve. */
async function flushSearch() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}

const submitButton = () => screen.getByRole("button", { name: "Find meeting points" });
const addressInputs = () => screen.getAllByRole("combobox", { name: /^Starting address/ });
const rows = () => within(screen.getByRole("list", { name: "People" })).getAllByRole("listitem");

/** Type into the nth address field and pick the first suggestion by keyboard. */
async function resolveRow(user: ReturnType<typeof userEvent.setup>, index: number, query: string) {
  const input = addressInputs()[index];
  await user.click(input);
  await user.type(input, query);
  await flushSearch();
  await user.keyboard("{ArrowDown}{Enter}");
}

describe("MeetingForm: participants", () => {
  it("starts with two empty, labelled people and a disabled submit", () => {
    setup();
    expect(rows()).toHaveLength(2);
    expect(screen.getByRole("combobox", { name: "Starting address for Person 1" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Starting address for Person 2" })).toBeTruthy();
    expect((submitButton() as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText("Add where everyone is starting from. You need at least two people."),
    ).toBeTruthy();
  });

  it("keeps submit disabled with only one resolved participant", async () => {
    const { user } = setup();
    await resolveRow(user, 0, "Carrow Road");
    expect((addressInputs()[0] as HTMLInputElement).value).toBe("Carrow Road, Norwich, England");
    expect((submitButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("selecting a suggestion resolves a participant; two resolved enables submit and submits the server input", async () => {
    const { user, onSubmit } = setup();
    await resolveRow(user, 0, "Carrow Road");
    // pick the second one with the mouse
    const second = addressInputs()[1];
    await user.click(second);
    await user.type(second, "Mill Lane");
    await flushSearch();
    await user.click(screen.getByRole("option", { name: "Mill Lane, Cambridge, England" }));

    expect((second as HTMLInputElement).value).toBe("Mill Lane, Cambridge, England");
    expect((submitButton() as HTMLButtonElement).disabled).toBe(false);

    await user.click(submitButton());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({
      input: {
        participants: [
          { lat: 52.622, lng: 1.309 },
          { lat: 52.2, lng: 0.12 },
        ],
        mode: "driving-car",
        goal: "MINIMAX",
      },
      isochroneMinutes: 10,
      people: [
        { slot: 0, name: "Person 1", initial: "1", label: "Carrow Road, Norwich, England" },
        { slot: 1, name: "Person 2", initial: "2", label: "Mill Lane, Cambridge, England" },
      ],
    } satisfies MeetingFormValues);
  });

  it("editing the text after resolving unresolves the participant", async () => {
    const { user } = setup();
    await resolveRow(user, 0, "Carrow Road");
    await resolveRow(user, 1, "Mill Lane");
    expect((submitButton() as HTMLButtonElement).disabled).toBe(false);
    await user.type(addressInputs()[1], "x");
    expect((submitButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("removing a person below two resolved disables submit", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Add person" }));
    expect(rows()).toHaveLength(3);
    await resolveRow(user, 0, "Carrow Road");
    await resolveRow(user, 1, "Mill Lane");
    await resolveRow(user, 2, "High Street");

    await user.click(screen.getByRole("button", { name: "Remove Person 3" }));
    expect(rows()).toHaveLength(2);
    expect((submitButton() as HTMLButtonElement).disabled).toBe(false);

    // At the minimum of two rows the button clears the row instead of removing it.
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Clear Person 2" }));
    expect(rows()).toHaveLength(2);
    expect((addressInputs()[1] as HTMLInputElement).value).toBe("");
    expect((submitButton() as HTMLButtonElement).disabled).toBe(true);
    expect(document.activeElement).toBe(addressInputs()[1]);
  });

  it("removing a resolved person from three rows with two resolved disables submit", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Add person" }));
    await resolveRow(user, 0, "Carrow Road");
    await resolveRow(user, 1, "Mill Lane");
    await user.click(screen.getByRole("button", { name: "Remove Person 1" }));
    expect(rows()).toHaveLength(2);
    expect((submitButton() as HTMLButtonElement).disabled).toBe(true);
    // colours/numbers are stable: the remaining people keep their numbers
    expect(screen.getByRole("combobox", { name: "Starting address for Person 2" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Starting address for Person 3" })).toBeTruthy();
  });

  it("adds people up to the server maximum, then disables Add person", async () => {
    const { user } = setup();
    const add = screen.getByRole("button", { name: "Add person" });
    for (let i = 2; i < MAX_PARTICIPANTS; i += 1) await user.click(add);
    expect(rows()).toHaveLength(MAX_PARTICIPANTS);
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(`You can add up to ${MAX_PARTICIPANTS} people.`)).toBeTruthy();
  });

  it("focuses the new person's address field after Add person", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Add person" }));
    expect(document.activeElement).toBe(addressInputs()[2]);
  });

  it("shows a colour badge with the initial, from the typed name or the person number", async () => {
    const { user } = setup();
    const [first] = rows();
    expect(first.querySelector(".person-badge")?.textContent).toBe("1");
    await user.type(screen.getByRole("textbox", { name: "Name for person 1 (optional)" }), "ana");
    expect(first.querySelector(".person-badge")?.textContent).toBe("A");
    expect(screen.getByRole("combobox", { name: "Starting address for ana" })).toBeTruthy();
  });

  it("blocks submit and points at a field whose text was never resolved", async () => {
    const { user, onSubmit } = setup();
    await user.click(screen.getByRole("button", { name: "Add person" }));
    await resolveRow(user, 0, "Carrow Road");
    await resolveRow(user, 1, "Mill Lane");
    await user.type(addressInputs()[2], "Somewhere");
    await user.keyboard("{Escape}"); // close any list, keep the text
    await user.click(submitButton());
    expect(onSubmit).not.toHaveBeenCalled();
    const third = addressInputs()[2];
    expect(third.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Choose an address from the suggestions, or clear this field.")).toBeTruthy();
    expect(document.activeElement).toBe(third);
  });
});

describe("MeetingForm: trip options", () => {
  it("submits the chosen travel mode, goal and isochrone minutes", async () => {
    const { user, onSubmit } = setup();
    await resolveRow(user, 0, "Carrow Road");
    await resolveRow(user, 1, "Mill Lane");

    const travel = screen.getByRole("radiogroup", { name: "Travel" });
    expect(within(travel).getAllByRole("radio").map((r) => r.getAttribute("value"))).toEqual([
      "driving-car",
      "cycling-regular",
      "foot-walking",
    ]);
    expect((within(travel).getByRole("radio", { name: "Car" }) as HTMLInputElement).checked).toBe(true);
    await user.click(within(travel).getByRole("radio", { name: "Bike" }));

    const goal = screen.getByRole("combobox", { name: "Goal" });
    expect(within(goal).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Fairest for everyone",
      "Least total travel",
      "Most similar times",
    ]);
    await user.selectOptions(goal, "MINIMIZE_TOTAL");
    await user.selectOptions(screen.getByRole("combobox", { name: "Minutes for isochrone" }), "30");

    await user.click(submitButton());
    const values = onSubmit.mock.calls[0][0];
    expect(values.input.mode).toBe("cycling-regular");
    expect(values.input.goal).toBe("MINIMIZE_TOTAL");
    expect(values.isochroneMinutes).toBe(30);
  });

  it("offers isochrone minutes only within the server range", () => {
    setup();
    const values = within(screen.getByRole("combobox", { name: "Minutes for isochrone" }))
      .getAllByRole("option")
      .map((o) => Number((o as HTMLOptionElement).value));
    expect(values.length).toBeGreaterThan(1);
    expect(values.every((m) => Number.isInteger(m) && m >= 1 && m <= 60)).toBe(true);
  });

  it("while pending shows the loading label and does not submit again", async () => {
    const { user, onSubmit, rerender } = setup();
    await resolveRow(user, 0, "Carrow Road");
    await resolveRow(user, 1, "Mill Lane");
    rerender(<MeetingForm onSubmit={onSubmit} pending />);
    const busy = screen.getByRole("button", { name: "Finding meeting points" });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    await user.click(busy);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("MeetingForm: page integration", () => {
  it("takes a form id and reports whether it can submit", async () => {
    const onCanSubmitChange = vi.fn();
    const { user, container } = setup({ formId: "meeting-form", onCanSubmitChange });
    expect(container.querySelector("form")!.id).toBe("meeting-form");
    expect(onCanSubmitChange).toHaveBeenLastCalledWith(false);
    await resolveRow(user, 0, "Carrow Road");
    await resolveRow(user, 1, "Mill Lane");
    expect(onCanSubmitChange).toHaveBeenLastCalledWith(true);
  });

  it("blocked (rate-limit countdown) disables submit and ignores a submit from outside", async () => {
    const { user, onSubmit, rerender, container } = setup();
    await resolveRow(user, 0, "Carrow Road");
    await resolveRow(user, 1, "Mill Lane");
    submitButton().focus();
    rerender(<MeetingForm onSubmit={onSubmit} pending={false} blocked />);
    // aria-disabled, not native disabled: a focused button must keep focus
    expect((submitButton() as HTMLButtonElement).disabled).toBe(false);
    expect(submitButton().getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(submitButton());
    await user.keyboard("{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    act(() => {
      container.querySelector("form")!.requestSubmit();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onInvalid before moving focus to an unresolved field", async () => {
    const order: string[] = [];
    const onInvalid = vi.fn(() => order.push(`invalid, focus on ${document.activeElement?.tagName}`));
    const { user } = setup({ onInvalid });
    await user.click(screen.getByRole("button", { name: "Add person" }));
    await resolveRow(user, 0, "Carrow Road");
    await resolveRow(user, 1, "Mill Lane");
    await user.type(addressInputs()[2], "Somewhere");
    await user.keyboard("{Escape}");
    await user.click(submitButton());
    expect(onInvalid).toHaveBeenCalledTimes(1);
    expect(order[0]).toBe("invalid, focus on BUTTON");
    expect(document.activeElement).toBe(addressInputs()[2]);
  });
});

describe("MeetingForm: keyboard", () => {
  it("follows a logical tab order through the whole form", async () => {
    const { user } = setup();
    await resolveRow(user, 0, "Carrow Road");
    await resolveRow(user, 1, "Mill Lane");
    (document.activeElement as HTMLElement).blur();

    const order: string[] = [];
    for (let i = 0; i < 11; i += 1) {
      await user.tab();
      const el = document.activeElement as HTMLElement;
      order.push(
        el.getAttribute("aria-label") ??
          (el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : null) ??
          el.textContent ??
          el.tagName,
      );
    }
    // DOM order matches the visual order: each row's header line (badge,
    // name, Clear/Remove) comes before its address field.
    expect(order).toEqual([
      "Name for person 1 (optional)",
      "Clear Person 1",
      "Starting address for Person 1",
      "Name for person 2 (optional)",
      "Clear Person 2",
      "Starting address for Person 2",
      "Add person",
      "Car", // the radio group is one tab stop (the checked radio)
      "Goal",
      "Minutes for isochrone",
      "Find meeting points",
    ]);
  });
});

describe("MeetingForm: server render", () => {
  it("hydrates without mismatches (ids are deterministic)", async () => {
    vi.useRealTimers();
    const { renderToString } = await import("react-dom/server");
    const { hydrateRoot } = await import("react-dom/client");
    const html = renderToString(<MeetingForm onSubmit={() => {}} pending={false} />);
    // Simulate a fresh client: the same component rendered again must match.
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    const onRecoverableError = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <MeetingForm onSubmit={() => {}} pending={false} />, {
        onRecoverableError,
      });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
    act(() => root.unmount());
    container.remove();
  });
});
