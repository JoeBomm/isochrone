import { describe, expect, it } from "vitest";
import { approximateLocation } from "./cfLocation";

describe("approximateLocation", () => {
  it("reads request.cf string coordinates and rounds them to ~11 km", () => {
    expect(approximateLocation({ latitude: "42.46140", longitude: "-83.18270", country: "US" })).toEqual({
      lat: 42.5,
      lng: -83.2,
    });
    expect(approximateLocation({ latitude: 52.52, longitude: 13.41 })).toEqual({ lat: 52.5, lng: 13.4 });
  });

  it("is undefined without a usable location", () => {
    for (const cf of [
      undefined,
      null,
      "x",
      {},
      { latitude: "", longitude: "" },
      { latitude: null, longitude: null },
      { latitude: "abc", longitude: "1" },
      { latitude: "91", longitude: "0" },
      { latitude: "0", longitude: "181" },
    ]) {
      expect(approximateLocation(cf)).toBeUndefined();
    }
  });
});
