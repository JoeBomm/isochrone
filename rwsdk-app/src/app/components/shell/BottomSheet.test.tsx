import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BottomSheet, nextSnap } from "./BottomSheet";

function renderSheet(props: Partial<Parameters<typeof BottomSheet>[0]> = {}) {
  return render(
    <>
      <h1 id="title">Halfway</h1>
      <BottomSheet labelledBy="title" {...props}>
        <p>Panel content</p>
      </BottomSheet>
    </>,
  );
}

const region = () => screen.getByRole("region", { name: "Halfway" });
const handle = () => screen.getAllByRole("button")[0];

describe("nextSnap", () => {
  it("cycles peek -> half -> full -> peek", () => {
    expect(nextSnap("peek")).toBe("half");
    expect(nextSnap("half")).toBe("full");
    expect(nextSnap("full")).toBe("peek");
  });
});

describe("BottomSheet", () => {
  it("is a labelled region whose handle is a real button controlling the body", () => {
    renderSheet();
    expect(region().getAttribute("data-snap")).toBe("half");
    const button = handle();
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    const body = document.getElementById(button.getAttribute("aria-controls") ?? "");
    expect(body?.textContent).toBe("Panel content");
  });

  it("cycles snap points with Enter and Space", async () => {
    const user = userEvent.setup();
    renderSheet({ defaultSnap: "peek" });
    handle().focus();

    expect(handle().getAttribute("aria-label")).toBe("Expand panel");
    await user.keyboard("{Enter}");
    expect(region().getAttribute("data-snap")).toBe("half");
    expect(handle().getAttribute("aria-label")).toBe("Expand panel to full screen");

    await user.keyboard(" ");
    expect(region().getAttribute("data-snap")).toBe("full");
    expect(handle().getAttribute("aria-label")).toBe("Collapse panel");

    await user.keyboard("{Enter}");
    expect(region().getAttribute("data-snap")).toBe("peek");
    expect(document.activeElement).toBe(handle());
  });

  it("steps with ArrowUp/ArrowDown without wrapping", async () => {
    const user = userEvent.setup();
    renderSheet({ defaultSnap: "half" });
    handle().focus();
    await user.keyboard("{ArrowUp}");
    expect(region().getAttribute("data-snap")).toBe("full");
    await user.keyboard("{ArrowUp}");
    expect(region().getAttribute("data-snap")).toBe("full");
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(region().getAttribute("data-snap")).toBe("peek");
  });

  it("supports a controlled snap", async () => {
    const user = userEvent.setup();
    const onSnapChange = vi.fn();
    const { rerender } = renderSheet({ snap: "full", onSnapChange });
    await user.click(handle());
    expect(onSnapChange).toHaveBeenCalledWith("peek");
    // still "full" until the parent updates the prop
    expect(region().getAttribute("data-snap")).toBe("full");
    rerender(
      <>
        <h1 id="title">Halfway</h1>
        <BottomSheet labelledBy="title" snap="peek" onSnapChange={onSnapChange}>
          <p>Panel content</p>
        </BottomSheet>
      </>,
    );
    expect(region().getAttribute("data-snap")).toBe("peek");
  });
});
