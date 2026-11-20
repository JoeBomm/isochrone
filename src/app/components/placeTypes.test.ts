import { describe, expect, it } from "vitest";
import { PLACE_FILTERS } from "@/domain/constants";
import { PLACE_TYPES } from "@/domain/types";
import { PLACE_TYPE_OPTIONS } from "./participants";

describe("place types", () => {
  it("every type has a POI filter with ids", () => {
    for (const type of PLACE_TYPES) {
      const f = PLACE_FILTERS[type] as { category_ids?: number[]; category_group_ids?: number[] };
      const ids = f.category_ids ?? f.category_group_ids;
      expect(ids?.length, type).toBeGreaterThan(0);
    }
  });

  it("the picker offers every type exactly once, sorted alphabetically by label", () => {
    expect(PLACE_TYPE_OPTIONS.map((o) => o.value).sort()).toEqual([...PLACE_TYPES].sort());
    const labels = PLACE_TYPE_OPTIONS.map((o) => o.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });
});
