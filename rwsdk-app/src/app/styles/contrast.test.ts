import { describe, expect, it } from "vitest";
import tokensCss from "./tokens.css?raw";
import { contrastRatio, parseSchemes } from "./contrast";

/**
 * Every foreground/background token pair the UI actually uses, checked against
 * WCAG AA in both colour schemes. Add a pair here when a new combination is
 * introduced in CSS.
 */

// Text: >= 4.5:1 (WCAG 1.4.3).
const TEXT_PAIRS: Array<[fg: string, bg: string]> = [
  ["ink", "paper"], // body text
  ["ink", "surface"], // input text, cards
  ["ink-muted", "paper"], // hints, secondary text
  ["ink-muted", "surface"], // placeholders, map label
  ["harbour", "paper"], // links, quiet buttons
  ["harbour", "surface"], // secondary button text
  ["harbour", "harbour-tint"], // secondary/quiet hover
  ["on-harbour", "harbour"], // primary button
  ["on-harbour", "harbour-strong"], // primary button hover
  ["danger", "paper"], // field error text
  ["danger", "surface"],
  ["danger", "danger-tint"], // error alert title
  ["ink", "danger-tint"], // error alert body
  ["ink", "harbour-tint"], // info alert body
  ["ink-muted", "harbour-tint"],
];

// UI component edges and graphics: >= 3:1 (WCAG 1.4.11).
const UI_PAIRS: Array<[fg: string, bg: string]> = [
  ["edge", "paper"], // input/select border, sheet grip
  ["edge", "surface"],
  ["harbour", "paper"], // focus ring, secondary button border
  ["harbour", "surface"],
  ["harbour", "harbour-tint"], // info alert icon and border
  ["danger", "surface"], // invalid input border
  ["danger", "danger-tint"], // error alert icon and border
  ["ink", "surface"], // select chevron
];

// Participant badges (ParticipantList): a person-coloured disc with the
// initial in --person-N-on, ringed with --person-ring. Several person colours
// are below 3:1 on --surface (e.g. #56B4E9 is 2.3:1), so the ring, not the
// fill, carries the 3:1 edge against the panel and inputs.
const PERSONS = [1, 2, 3, 4, 5, 6];
const BADGE_TEXT_PAIRS: Array<[fg: string, bg: string]> = PERSONS.map((n) => [
  `person-${n}-on`,
  `person-${n}`,
]);
const BADGE_RING_PAIRS: Array<[fg: string, bg: string]> = [
  ["person-ring", "surface"],
  ["person-ring", "paper"],
];
TEXT_PAIRS.push(...BADGE_TEXT_PAIRS);
UI_PAIRS.push(...BADGE_RING_PAIRS);

const schemes = parseSchemes(tokensCss);

describe.each(["light", "dark"] as const)("%s scheme contrast", (name) => {
  const scheme = schemes[name];
  const ratio = (fg: string, bg: string) => {
    expect(scheme[fg], `missing --${fg}`).toBeDefined();
    expect(scheme[bg], `missing --${bg}`).toBeDefined();
    return contrastRatio(scheme[fg], scheme[bg]);
  };

  it.each(TEXT_PAIRS)("text --%s on --%s is at least 4.5:1", (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS)("UI edge --%s on --%s is at least 3:1", (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3);
  });
});

describe("contrast helpers", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });

  it("reads both schemes from tokens.css, dark overriding light", () => {
    expect(schemes.light.paper).toBe("#f2f5f7");
    expect(schemes.dark.paper).toBe("#0f1a22");
    // person colours are not overridden, so dark inherits them
    expect(schemes.dark["person-1"]).toBe(schemes.light["person-1"]);
  });
});
