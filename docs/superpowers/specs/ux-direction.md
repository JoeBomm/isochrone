# UX direction: "Halfway" meeting-point finder

Status: PROPOSED, awaiting user approval (plan Task 7, Step 1). Nothing in `rwsdk-app/src/app` is built from this until approved.

## Subject and job

People who live in different places want to meet somewhere that is fair for everyone. The app's one job: take 2 or more starting points, show the best few meeting spots, and make it obvious why one is fairer than another. Primary audience: friends and small groups planning a meetup, mostly on a phone.

Flow (from the spec): add people -> see best meeting points -> pick one -> see the isochrone.

## The memorable thing: the fairness strip

Every result shows one thin horizontal bar per person, all on the same time scale, each in that person's colour. Equal-length bars mean a fair spot. The longest bar is labelled (the "max" that MINIMAX optimises). This is the single bold element. It answers "why this place?" at a glance and doubles as the text alternative to the map (it is a ranked list with real times, not a picture).

```
 1  Carrow Park                      38 min worst case
    Ana   ████████████████████████░░░░  34
    Ben   ██████████████████████████░░  36
    Cleo  ██████████████████████████████ 38
```

Everything else stays quiet so the strip carries the page.

## Tokens

Colour (light, with a dark scheme via `prefers-color-scheme`; all text pairs must be at least WCAG AA 4.5:1, UI edges 3:1):

| Token | Light | Dark | Role |
|---|---|---|---|
| `--paper` | `#F2F5F7` | `#0F1A22` | page and panel background (cool chart-paper, not cream) |
| `--surface` | `#FFFFFF` | `#16252F` | inputs, result rows |
| `--ink` | `#13232E` | `#E6EEF2` | text |
| `--ink-muted` | `#4A5E6B` | `#9FB3BF` | secondary text |
| `--harbour` | `#0B6A73` | `#4FB6C0` | primary action, focus ring, selected result |
| `--rule` | `#C9D5DC` | `#2A3C48` | borders |

Participant colours (colour-blind safe, Okabe-Ito based; always paired with initials or a name, never colour alone): `#0072B2`, `#D55E00`, `#009E73`, `#CC79A7`, `#56B4E9`, `#B8860B`, extended by cycling with a shape/letter difference for people 7+.

Result markers are ink-filled circles with the rank number; the selected one is harbour with a ring. The isochrone polygon is harbour at low opacity with a solid outline.

Type: one variable family, Schibsted Grotesk, self-hosted via `@fontsource-variable` because the starter CSP only allows `'self'`. Weights 400/600/700. Tabular numerals for all times. Scale (rem): 0.8125, 0.9375, 1, 1.25, 1.75; body 1rem/1.5, line length under 70ch. Sentence case everywhere; no all-caps labels, no eyebrow text.

Shape and spacing: 4px base grid; 8px radius on controls, 12px on the mobile sheet, no card-per-everything (results are rows separated by rules, not shadowed cards). One soft shadow, only on the mobile sheet. Focus ring: 3px harbour outline with 2px offset, always visible.

Motion: none on load. Responsive motion only: sheet snapping, result selection fly-to, isochrone draw-in. All off under `prefers-reduced-motion`.

## Layout

Desktop (>= 960px): a 400px left panel (form, then results) and a map filling the rest. The panel scrolls; the map never does.

```
+-----------------+-------------------------------+
| Halfway         |                               |
| People          |                               |
|  o Ana  [x]     |             MAP               |
|  o Ben  [x]     |    (pins, results, isochrone) |
|  + Add person   |                               |
| Travel  [Car|Bike|Walk]                         |
| Goal    [Fairest ▾]                             |
| [ Find meeting points ]                         |
| Results (fairness strips)                       |
+-----------------+-------------------------------+
```

Mobile: the map fills the screen; a bottom sheet holds the same content with three snap points (peek: the primary button and result count; half; full). Selecting a result snaps the sheet to peek so the map and polygon are visible. The sheet is a labelled region with a visible drag handle that is also a button (Enter/Space cycles snap points), so it works without touch.

Alignment: left-aligned text throughout.

## States (copy is plain, active voice, says what to do)

- Empty: map shows a neutral default view. Panel says "Add where everyone is starting from. You need at least two people." No illustration.
- Loading: button shows a spinner and "Finding meeting points"; results area keeps its height (skeleton rows with the strip shapes). Isochrone loading shows a spinner on the selected row.
- No reachable point: "No place is reachable for everyone by this travel mode. Try another mode or move a start point."
- Rate limited: "You're searching too fast. Try again in {n} seconds." with a visible countdown that re-enables the button.
- Quota: "The route service has reached its daily limit. Try again later."
- Not found (geocode): inline under the field, "We couldn't find that address. Try adding a city."
- Generic error: "Something went wrong on our side. Try again." with a Retry button.
- Errors use an `Alert` with `role="alert"` for submit failures and `aria-live="polite"` for inline field messages.

## Accessibility floor

Keyboard operable end to end (participant list, address suggestions as an ARIA combobox, segmented control as a radio group, sheet handle). Every control labelled. AA contrast verified in both schemes. Map is supplementary: the ranked list with times carries all information. Debug hypothesis-point layer only with `?debug=1`.

## Primitives (Task 7) and how they follow the direction

Button (primary harbour / secondary outline / quiet), Field (label, hint, error), Select, Card (only for the isochrone summary and styleguide), Alert (info/error), Spinner. Shown on `/_styleguide` at 375px and 1280px in light and dark.

## Alternatives considered

1. Transit-map look (bold route lines, station-dot markers). Strong theme, but it competes with the real map tiles and invites colour-only encoding. Rejected.
2. Neutral Material-style app. Fastest, no risk, but anonymous and does not make the fairness idea visible. Rejected.

## Decisions that are yours

- Name shown in the header ("Halfway" is a placeholder).
- Whether dark mode ships in v1 (proposed: yes, tokens make it cheap).
- Goal labels in the UI (proposed: Fairest for everyone = MINIMAX, Least total travel = MINIMIZE_TOTAL, Most similar times = MINIMIZE_VARIANCE).
