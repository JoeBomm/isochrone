"use client";

import { useEffect, useState } from "react";
import { MeetingForm, type MeetingFormValues } from "@/app/components/MeetingForm";
import { Alert } from "@/app/components/ui";

/**
 * Dev-only harness for /_styleguide/form: the real MeetingForm (real
 * geocodeAction) with a fake submit that shows the pending state and then the
 * values that would go to findMeetingPointsAction. Task 9 replaces this with
 * the real HomePage.
 */
export function MeetingFormDemo() {
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState<MeetingFormValues | null>(null);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(false), 1500);
    return () => clearTimeout(timer);
  }, [pending]);

  return (
    <>
      <MeetingForm
        pending={pending}
        onSubmit={(values) => {
          setSubmitted(values);
          setPending(true);
        }}
      />
      {submitted && !pending ? (
        <Alert tone="info" title="Would search with">
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: "var(--text-xs)" }}>{JSON.stringify(submitted, null, 2)}</pre>
        </Alert>
      ) : null}
    </>
  );
}
