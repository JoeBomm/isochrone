import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Alert, Button, Card, Field, Select, Spinner } from "./index";

describe("Field", () => {
  it("associates the label with the input", () => {
    render(<Field label="Starting address" />);
    const input = screen.getByLabelText("Starting address");
    expect(input.tagName).toBe("INPUT");
  });

  it("links hint and error with aria-describedby and marks the input invalid", () => {
    render(
      <Field
        label="Starting address"
        hint="Street, town or postcode."
        error="We couldn't find that address. Try adding a city."
      />,
    );
    const input = screen.getByRole("textbox", { name: "Starting address" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const ids = (input.getAttribute("aria-describedby") ?? "").split(" ");
    const texts = ids.map((id) => document.getElementById(id)?.textContent);
    expect(texts).toEqual([
      "Street, town or postcode.",
      "We couldn't find that address. Try adding a city.",
    ]);
  });

  it("has no aria-invalid or describedby without hint/error, but keeps a live region", () => {
    const { container } = render(<Field label="Name" />);
    const input = screen.getByRole("textbox", { name: "Name" });
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.hasAttribute("aria-describedby")).toBe(false);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live?.textContent).toBe("");
  });

  it("keeps caller aria-describedby ids", () => {
    render(<Field label="Name" error="Required" aria-describedby="extra" />);
    const input = screen.getByRole("textbox", { name: "Name" });
    expect(input.getAttribute("aria-describedby")?.split(" ")).toContain("extra");
  });

  it("gives two fields distinct ids", () => {
    render(
      <>
        <Field label="First" />
        <Field label="Second" />
      </>,
    );
    expect(screen.getByLabelText("First").id).not.toBe(screen.getByLabelText("Second").id);
  });
});

describe("Select", () => {
  it("is labelled, renders options and links its error", () => {
    render(
      <Select
        label="Goal"
        error="Choose a goal."
        options={[
          { value: "MINIMAX", label: "Fairest for everyone" },
          { value: "MINIMIZE_TOTAL", label: "Least total travel" },
        ]}
      />,
    );
    const select = screen.getByRole("combobox", { name: "Goal" });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Fairest for everyone",
      "Least total travel",
    ]);
    const describedBy = select.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)?.textContent).toBe("Choose a goal.");
    expect(select.getAttribute("aria-invalid")).toBe("true");
  });
});

describe("Alert", () => {
  it("uses role=alert for errors", () => {
    render(<Alert tone="error" title="Something went wrong on our side. Try again." />);
    expect(screen.getByRole("alert").textContent).toContain("Something went wrong");
  });

  it("uses role=status for info", () => {
    render(<Alert tone="info">Pick a meeting point.</Alert>);
    expect(screen.getByRole("status").textContent).toContain("Pick a meeting point.");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Button", () => {
  it("softDisabled keeps focus, is aria-disabled (not native disabled) and swallows click and submit", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onSubmit = vi.fn((e: { preventDefault(): void }) => e.preventDefault());
    const { rerender } = render(
      <form onSubmit={onSubmit}>
        <Button type="submit" onClick={onClick}>Find meeting points</Button>
      </form>,
    );
    const button = screen.getByRole("button", { name: "Find meeting points" }) as HTMLButtonElement;
    button.focus();
    rerender(
      <form onSubmit={onSubmit}>
        <Button type="submit" onClick={onClick} softDisabled>Find meeting points</Button>
      </form>,
    );
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("aria-busy")).toBe(false);
    expect(document.activeElement).toBe(button);
    await user.keyboard("{Enter}");
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("defaults to type=button and calls onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Find meeting points</Button>);
    const button = screen.getByRole("button", { name: "Find meeting points" });
    expect(button.getAttribute("type")).toBe("button");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Find meeting points
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Find meeting points" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("while loading: busy, aria-disabled, keeps focus, swallows clicks and shows the loading label", async () => {
    const onClick = vi.fn();
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    const { rerender } = render(
      <form onSubmit={(e) => onSubmit(e.nativeEvent)}>
        <Button type="submit" onClick={onClick}>
          Find meeting points
        </Button>
      </form>,
    );
    const button = screen.getByRole("button", { name: "Find meeting points" });
    button.focus();

    rerender(
      <form onSubmit={(e) => onSubmit(e.nativeEvent)}>
        <Button type="submit" onClick={onClick} loading loadingLabel="Finding meeting points">
          Find meeting points
        </Button>
      </form>,
    );
    const loading = screen.getByRole("button", { name: "Finding meeting points" });
    expect(loading).toBe(button);
    expect(loading.getAttribute("aria-busy")).toBe("true");
    expect(loading.getAttribute("aria-disabled")).toBe("true");
    expect((loading as HTMLButtonElement).disabled).toBe(false);
    expect(document.activeElement).toBe(loading);

    await userEvent.click(loading);
    await userEvent.keyboard("{Enter}");
    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("Spinner", () => {
  it("has an accessible name", () => {
    render(<Spinner label="Loading isochrone" />);
    expect(screen.getByRole("status").textContent).toBe("Loading isochrone");
  });

  it("is hidden from assistive tech when decorative", () => {
    const { container } = render(<Spinner decorative />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("Card", () => {
  it("is a labelled region when it has a title", () => {
    render(<Card title="Reachable within 30 minutes">Body</Card>);
    expect(screen.getByRole("region", { name: "Reachable within 30 minutes" })).toBeTruthy();
  });

  it("is a plain container without a title", () => {
    render(<Card>Body</Card>);
    expect(screen.queryByRole("region")).toBeNull();
  });
});
