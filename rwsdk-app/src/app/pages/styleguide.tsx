import { Alert, Button, Card, Field, Select, Spinner } from "@/app/components/ui";
import sgStyles from "./styleguide.css?url";

/**
 * /_styleguide: every primitive in every state, for design review and
 * screenshot checks. Registered only on the Vite dev server (see worker.tsx),
 * so it is not part of production builds' routing.
 */

const COLOUR_TOKENS: Array<[string, string]> = [
  ["--paper", "Page and panel background"],
  ["--surface", "Inputs, result rows"],
  ["--ink", "Text"],
  ["--ink-muted", "Secondary text"],
  ["--harbour", "Primary action, focus ring, selected"],
  ["--harbour-strong", "Primary hover"],
  ["--harbour-tint", "Info and selected backgrounds"],
  ["--on-harbour", "Text on harbour"],
  ["--rule", "Dividers (decorative)"],
  ["--edge", "Control borders"],
  ["--danger", "Error text and borders"],
  ["--danger-tint", "Error background"],
];

const PERSON_TOKENS = ["--person-1", "--person-2", "--person-3", "--person-4", "--person-5", "--person-6"];

const TYPE_SCALE: Array<[string, string]> = [
  ["--text-xl", "1.75rem: page title"],
  ["--text-lg", "1.25rem: section heading"],
  ["--text-md", "1rem: body and controls"],
  ["--text-sm", "0.9375rem: labels, hints"],
  ["--text-xs", "0.8125rem: fine print"],
];

const VARIANT_LABEL = { primary: "Primary", secondary: "Secondary", quiet: "Quiet" };

const GOALS = [
  { value: "MINIMAX", label: "Fairest for everyone" },
  { value: "MINIMIZE_TOTAL", label: "Least total travel" },
  { value: "MINIMIZE_VARIANCE", label: "Most similar times" },
];

export const Styleguide = () => (
  <div className="sg">
    {/* Kept out of app.css so production never ships styleguide-only CSS.
        No `precedence`: React's hoisting emits a preload with an invalid
        `as` value here; a body stylesheet link is valid HTML. */}
    <link rel="stylesheet" href={sgStyles} />
    <header className="sg__intro stack">
      <h1>Styleguide</h1>
      <p className="muted">
        Every primitive in every state. Press Tab to walk through the controls:
        each one shows a 3px harbour focus ring. Switch your system to dark mode
        to check the dark scheme. The app shell is at <a href="/">/</a>.
      </p>
    </header>

    <Section title="Colour">
      <ul className="sg__swatches">
        {COLOUR_TOKENS.map(([token, role]) => (
          <li key={token} className="sg__swatch">
            <span className="sg__chip" style={{ background: `var(${token})` }} />
            <code>{token}</code>
            <span className="muted">{role}</span>
          </li>
        ))}
      </ul>
      <h3>Participants</h3>
      <p className="muted">Always paired with a name or initials, never colour alone.</p>
      <ul className="sg__people">
        {PERSON_TOKENS.map((token, index) => (
          <li key={token} className="sg__person">
            <span className="sg__dot" style={{ background: `var(${token})` }} aria-hidden="true">
              {String.fromCharCode(65 + index)}
            </span>
            <code>{token}</code>
          </li>
        ))}
      </ul>
    </Section>

    <Section title="Type">
      <ul className="sg__type">
        {TYPE_SCALE.map(([token, note]) => (
          <li key={token}>
            <span style={{ fontSize: `var(${token})` }}>Meet halfway between Ana and Ben</span>
            <span className="muted sg__note">
              <code>{token}</code> {note}
            </span>
          </li>
        ))}
        <li>
          <span className="sg__times">
            {[
              ["Ana", 34],
              ["Ben", 36],
              ["Cleo", 108],
            ].map(([name, minutes]) => (
              <span key={name} className="sg__time">
                <span>{name}</span>
                <span className="num">{minutes}</span>
                <span>min</span>
              </span>
            ))}
          </span>
          <span className="muted sg__note">
            Tabular numerals (<code>.num</code>) for times, so columns line up
          </span>
        </li>
      </ul>
    </Section>

    <Section title="Button">
      <div className="sg__grid">
        {(["primary", "secondary", "quiet"] as const).map((variant) => (
          <div key={variant} className="sg__row">
            <span className="sg__label">{VARIANT_LABEL[variant]}</span>
            <Button variant={variant}>Find meeting points</Button>
            <Button variant={variant} disabled>
              Disabled
            </Button>
            <Button variant={variant} loading loadingLabel="Finding meeting points">
              Find meeting points
            </Button>
          </div>
        ))}
      </div>
    </Section>

    <Section title="Field">
      <div className="sg__fields">
        <Field label="Starting address" placeholder="Street, town or postcode" />
        <Field
          label="Starting address"
          hint="Type at least three characters to see suggestions."
          defaultValue="12 Harbour Road"
        />
        <Field
          label="Starting address"
          defaultValue="Nowhere street"
          error="We couldn't find that address. Try adding a city."
        />
        <Field label="Starting address" disabled defaultValue="Locked while searching" />
      </div>
    </Section>

    <Section title="Select">
      <div className="sg__fields">
        <Select label="Goal" options={GOALS} defaultValue="MINIMAX" />
        <Select
          label="Goal"
          hint="How to weigh everyone's travel time."
          options={GOALS}
          defaultValue="MINIMIZE_TOTAL"
        />
        <Select label="Goal" options={GOALS} error="Choose a goal." defaultValue="MINIMAX" />
        <Select label="Goal" options={GOALS} disabled defaultValue="MINIMIZE_VARIANCE" />
      </div>
    </Section>

    <Section title="Card">
      <div className="sg__fields">
        <Card title="Reachable within 30 minutes">
          <p className="muted">
            The shaded area shows everywhere you can reach from Carrow Park by car.
          </p>
        </Card>
        <Card>
          <p>A card without a title renders as a plain container.</p>
        </Card>
      </div>
    </Section>

    <Section title="Alert">
      <div className="stack">
        <Alert tone="info" title="Isochrones are drawn on request">
          Pick a meeting point to see how far everyone can travel.
        </Alert>
        <Alert tone="info">You&apos;re searching too fast. Try again in 12 seconds.</Alert>
        <Alert
          tone="error"
          title="Something went wrong on our side. Try again."
          action={<Button variant="secondary">Retry</Button>}
        />
        <Alert tone="error" title="No place is reachable for everyone by this travel mode.">
          Try another mode or move a start point.
        </Alert>
      </div>
    </Section>

    <Section title="Spinner">
      <div className="sg__row">
        <Spinner size="sm" label="Loading isochrone" />
        <Spinner size="md" label="Loading" />
        <Spinner size="lg" label="Loading map" />
        <span className="sg__inline">
          <Spinner size="sm" decorative /> Loading isochrone
        </span>
      </div>
    </Section>
  </div>
);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `sg-${title.toLowerCase()}`;
  return (
    <section className="sg__section stack" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}
