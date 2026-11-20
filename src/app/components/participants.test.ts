import { describe, expect, it } from "vitest";
import { searchFocus } from "./participants";

const at = (lat: number, lng: number) => ({ coordinate: { lat, lng }, label: "x" });

describe("searchFocus", () => {
  it("is undefined when no other row is resolved", () => {
    expect(searchFocus([{ id: "a", place: at(1, 1) }, { id: "b", place: null }], "a")).toBeUndefined();
  });

  it("is the rounded centroid of the other rows' places, excluding the row itself", () => {
    const rows = [
      { id: "a", place: at(10, 10) },
      { id: "b", place: at(42.41, -83.11) },
      { id: "c", place: at(42.51, -83.31) },
      { id: "d", place: null },
    ];
    expect(searchFocus(rows, "a")).toEqual({ lat: 42.5, lng: -83.2 });
  });
});
