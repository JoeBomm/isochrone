import { AppShell } from "@/app/components/shell/AppShell";
import { Button } from "@/app/components/ui";

/**
 * Home: the app shell in its empty state. The participant form and results
 * replace this content in Task 8.
 */
export const Home = () => (
  <AppShell>
    <section className="stack" aria-labelledby="people-heading">
      <h2 id="people-heading">People</h2>
      <p className="muted">
        Add where everyone is starting from. You need at least two people.
      </p>
      <Button disabled>Find meeting points</Button>
    </section>
  </AppShell>
);
