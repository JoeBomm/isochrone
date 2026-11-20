import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/actions", () => ({ geocodeAction: vi.fn() }));

import { geocodeAction } from "@/server/actions";
import { AddressField } from "./AddressField";
import type { ResolvedPlace } from "./participants";

const geocode = vi.mocked(geocodeAction);
type GeocodeReturn = Awaited<ReturnType<typeof geocodeAction>>;

function results(...labels: string[]): GeocodeReturn {
  return {
    ok: true,
    data: { results: labels.map((label, i) => ({ coordinate: { lat: 50 + i, lng: i }, label })) },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const onSelect = vi.fn<(place: ResolvedPlace) => void>();

function Harness({ error, focus }: { error?: string; focus?: { lat: number; lng: number } }) {
  const [value, setValue] = useState("");
  const [place, setPlace] = useState<ResolvedPlace | null>(null);
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <AddressField
        label="Starting address for Ana"
        value={value}
        place={place}
        focus={focus}
        error={error}
        onChange={(text) => {
          setValue(text);
          setPlace(null);
        }}
        onSelect={(p) => {
          setValue(p.label);
          setPlace(p);
          onSelect(p);
        }}
      />
      <button type="submit">Next control</button>
    </form>
  );
}

function setup(focus?: { lat: number; lng: number }) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<Harness focus={focus} />);
  const input = screen.getByRole("combobox", { name: "Starting address for Ana" });
  return { user, input: input as HTMLInputElement };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  geocode.mockReset();
  onSelect.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AddressField: combobox semantics", () => {
  it("is an ARIA 1.2 combobox with a list popup, collapsed at first", () => {
    const { input } = setup();
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
    const controls = input.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
  });

  it("debounces the search (~300ms) and only searches the latest text", async () => {
    geocode.mockResolvedValue(results("Carrow Road, Norwich"));
    const { user, input } = setup();
    await user.type(input, "Carrow");
    await advance(299);
    expect(geocode).not.toHaveBeenCalled();
    await advance(1);
    expect(geocode).toHaveBeenCalledTimes(1);
    expect(geocode).toHaveBeenCalledWith("Carrow");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    const listbox = screen.getByRole("listbox");
    expect(listbox.id).toBe(input.getAttribute("aria-controls"));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Carrow Road, Norwich"]);
    expect(screen.getByRole("status").textContent).toMatch(/1 suggestion/);
  });

  it("does not search for fewer than three characters", async () => {
    const { user, input } = setup();
    await user.type(input, "Ca");
    await advance(1000);
    expect(geocode).not.toHaveBeenCalled();
  });

  it("ignores out-of-order (stale) responses", async () => {
    const first = deferred<GeocodeReturn>();
    const second = deferred<GeocodeReturn>();
    geocode.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { user, input } = setup();

    await user.type(input, "Mill");
    await advance(300);
    await user.type(input, " Lane");
    await advance(300);
    expect(geocode.mock.calls.map((c) => c[0])).toEqual(["Mill", "Mill Lane"]);

    await act(async () => second.resolve(results("Mill Lane, Cambridge")));
    await act(async () => first.resolve(results("Mill Road, Norwich", "Millbank, London")));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Mill Lane, Cambridge"]);
  });

  it("ignores a response that arrives after the text was edited again", async () => {
    const pending = deferred<GeocodeReturn>();
    geocode.mockReturnValueOnce(pending.promise);
    const { user, input } = setup();
    await user.type(input, "Mill");
    await advance(300);
    await user.type(input, "x"); // new text, debounce restarted
    await act(async () => pending.resolve(results("Mill Road, Norwich")));
    expect(screen.queryByRole("option")).toBeNull();
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("AddressField: no suggestions for a field that lost focus", () => {
  it("Tab within the debounce cancels the pending search; the list never opens", async () => {
    geocode.mockResolvedValue(results("Cambridge, England"));
    const { user, input } = setup();
    await user.click(input);
    await user.type(input, "Cambridge");
    await advance(100);
    await user.tab();
    await advance(1000);
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(geocode).not.toHaveBeenCalled();
  });

  it("Escape while a request is in flight: the late response does not open the list", async () => {
    const pending = deferred<GeocodeReturn>();
    geocode.mockReturnValueOnce(pending.promise);
    const { user, input } = setup();
    await user.click(input);
    await user.type(input, "Cambridge");
    await advance(300);
    expect(geocode).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    await act(async () => pending.resolve(results("Cambridge, England")));
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("blur while a request is in flight: the late response does not open the list", async () => {
    const pending = deferred<GeocodeReturn>();
    geocode.mockReturnValueOnce(pending.promise);
    const { user, input } = setup();
    await user.click(input);
    await user.type(input, "Cambridge");
    await advance(300);
    await user.tab();
    await act(async () => pending.resolve(results("Cambridge, England")));
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("a search that finishes while the field is unfocused fills the list but leaves it closed", async () => {
    geocode.mockResolvedValueOnce({
      ok: false,
      error: { code: "rate_limited", message: "Too many requests.", retryAfterSeconds: 1 },
    });
    geocode.mockResolvedValueOnce(results("Cambridge, England"));
    const { user, input } = setup();
    await user.click(input);
    await user.type(input, "Cambridge");
    await advance(300);
    await user.tab(); // focus moves on during the countdown
    await advance(1000); // countdown ends -> retry runs
    expect(geocode).toHaveBeenCalledTimes(2);
    expect(input.getAttribute("aria-expanded")).toBe("false");
    // Coming back and pressing ArrowDown shows the results without a new request.
    await user.click(input);
    await user.keyboard("{ArrowDown}");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Cambridge, England"]);
    expect(geocode).toHaveBeenCalledTimes(2);
  });
});

describe("AddressField: keyboard", () => {
  it("type -> ArrowDown -> Enter selects the suggestion and keeps focus in the input", async () => {
    geocode.mockResolvedValue(results("High Street, Oxford", "High Street, Bath"));
    const { user, input } = setup();
    await user.click(input);
    await user.type(input, "High Street");
    await advance(300);

    await user.keyboard("{ArrowDown}");
    const options = screen.getAllByRole("option");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id);
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    expect(options[1].getAttribute("aria-selected")).toBe("false");

    await user.keyboard("{ArrowDown}");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[1].id);
    await user.keyboard("{ArrowDown}"); // wraps
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id);
    await user.keyboard("{ArrowUp}"); // wraps back
    expect(input.getAttribute("aria-activedescendant")).toBe(options[1].id);

    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith({ coordinate: { lat: 51, lng: 1 }, label: "High Street, Bath" });
    expect(input.value).toBe("High Street, Bath");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
    expect(document.activeElement).toBe(input);
    // selecting does not trigger a new search
    await advance(1000);
    expect(geocode).toHaveBeenCalledTimes(1);
  });

  it("Escape closes the list without changing the text", async () => {
    geocode.mockResolvedValue(results("High Street, Oxford"));
    const { user, input } = setup();
    await user.type(input, "High");
    await advance(300);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{Escape}");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(input.value).toBe("High");
    // ArrowDown re-opens the list with the same suggestions
    await user.keyboard("{ArrowDown}");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(input.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[0].id);
  });

  it("Tab closes the list and moves on without selecting", async () => {
    geocode.mockResolvedValue(results("High Street, Oxford"));
    const { user, input } = setup();
    await user.type(input, "High");
    await advance(300);
    await user.keyboard("{ArrowDown}");
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Next control" }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("AddressField: errors", () => {
  it('shows the "not found" message inline and marks the field invalid', async () => {
    geocode.mockResolvedValue({
      ok: false,
      error: { code: "not_found", message: "No matching places found. Try a more specific address." },
    });
    const { user, input } = setup();
    await user.type(input, "Nowhere street");
    await advance(300);
    const message = screen.getByText("We couldn't find that address. Try adding a city.");
    expect(message.getAttribute("aria-live")).toBe("polite");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")?.split(" ")).toContain(message.id);
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows a retry countdown when rate limited, then searches again", async () => {
    geocode.mockResolvedValueOnce({
      ok: false,
      error: { code: "rate_limited", message: "Too many requests.", retryAfterSeconds: 3 },
    });
    geocode.mockResolvedValueOnce(results("Carrow Road, Norwich"));
    const { user, input } = setup();
    await user.type(input, "Carrow");
    await advance(300);
    expect(screen.getByText("You're searching too fast. Try again in 3 seconds.")).toBeTruthy();
    await advance(1000);
    expect(screen.getByText("You're searching too fast. Try again in 2 seconds.")).toBeTruthy();
    await advance(1000);
    expect(screen.getByText("You're searching too fast. Try again in 1 second.")).toBeTruthy();
    await advance(1000);
    expect(screen.queryByText(/searching too fast/)).toBeNull();
    expect(geocode).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Carrow Road, Norwich"]);
  });

  it("does not search while rate limited; searches the latest text once the countdown ends", async () => {
    geocode.mockResolvedValueOnce({
      ok: false,
      error: { code: "rate_limited", message: "Too many requests.", retryAfterSeconds: 2 },
    });
    geocode.mockResolvedValueOnce(results("Carrow Road, Norwich"));
    const { user, input } = setup();
    await user.type(input, "Carr");
    await advance(300);
    await user.type(input, "ow");
    await advance(300);
    expect(geocode).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Try again in \d seconds?\./)).toBeTruthy();
    await advance(2000);
    expect(geocode).toHaveBeenCalledTimes(2);
    expect(geocode).toHaveBeenLastCalledWith("Carrow");
    await advance(1000);
    expect(geocode).toHaveBeenCalledTimes(2);
  });

  it("shows the server's human-readable message for other errors", async () => {
    geocode.mockResolvedValue({
      ok: false,
      error: { code: "validation", message: "Search text must be at most 200 characters" },
    });
    const { user, input } = setup();
    await user.type(input, "Carrow");
    await advance(300);
    expect(screen.getByText("Search text must be at most 200 characters")).toBeTruthy();
  });

  it("uses the direction's copy for the daily quota", async () => {
    geocode.mockResolvedValue({ ok: false, error: { code: "quota", message: "quota" } });
    const { user, input } = setup();
    await user.type(input, "Carrow");
    await advance(300);
    expect(
      screen.getByText("The route service has reached its daily limit. Try again later."),
    ).toBeTruthy();
  });

  it("explains a failed call (network or server error) in plain words", async () => {
    geocode.mockRejectedValue(new Error("Server function returned status 500"));
    const { user, input } = setup();
    await user.type(input, "Carrow");
    await advance(300);
    expect(screen.getByText("We couldn't search for addresses just now. Try again.")).toBeTruthy();
  });

  it("clears a search error when the text changes", async () => {
    geocode.mockResolvedValue({ ok: false, error: { code: "not_found", message: "x" } });
    const { user, input } = setup();
    await user.type(input, "Nowhere");
    await advance(300);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    await user.type(input, "s");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
  });
});

describe("AddressField: search focus", () => {
  it("sends the bare query without a focus, and { text, focus } with one", async () => {
    geocode.mockResolvedValue(results("Somewhere"));
    const plain = setup();
    await plain.user.type(plain.input, "12345");
    await advance(300);
    expect(geocode).toHaveBeenLastCalledWith("12345");
  });

  it("passes the focus to the server", async () => {
    geocode.mockResolvedValue(results("Somewhere"));
    const { user, input } = setup({ lat: 42.5, lng: -83.2 });
    await user.type(input, "12345");
    await advance(300);
    expect(geocode).toHaveBeenLastCalledWith({ text: "12345", focus: { lat: 42.5, lng: -83.2 } });
  });
});
