import type { ReactNode } from "react";
import { BottomSheet } from "./BottomSheet";

export const APP_NAME = "Halfway"; // placeholder name (ux-direction.md)

export interface AppShellProps {
  /** Panel content (form, results). */
  children: ReactNode;
  /** Map region content. Defaults to a placeholder until Leaflet (Task 9). */
  map?: ReactNode;
}

/**
 * Responsive app shell: a persistent map region plus the controls panel.
 * >= 960px: 400px side panel on the left, map fills the rest.
 * <  960px: map fills the screen, panel is a bottom sheet (BottomSheet).
 * The panel comes first in the DOM so keyboard and screen reader users reach
 * the controls before the (supplementary) map.
 */
export function AppShell({ children, map }: AppShellProps) {
  return (
    <main className="shell">
      <BottomSheet labelledBy="app-title">
        <header className="shell__header">
          <Wordmark />
        </header>
        <div className="shell__content">{children}</div>
      </BottomSheet>
      <section className="shell__map" aria-label="Map">
        {map ?? <MapPlaceholder />}
      </section>
    </main>
  );
}

/**
 * Name plus a tiny fairness strip: three bars of different starts that all
 * reach the same line (everyone arrives at the meeting point). Different
 * starts and the finish line keep it from reading as a menu icon.
 */
function Wordmark() {
  return (
    <h1 className="wordmark" id="app-title">
      <svg className="wordmark__mark" viewBox="0 0 22 18" aria-hidden="true" focusable="false">
        <rect x="0" y="2" width="17" height="3" rx="1.5" className="wordmark__bar wordmark__bar--1" />
        <rect x="6" y="7.5" width="11" height="3" rx="1.5" className="wordmark__bar wordmark__bar--2" />
        <rect x="3" y="13" width="14" height="3" rx="1.5" className="wordmark__bar wordmark__bar--3" />
        <rect x="19" y="0" width="2.5" height="18" rx="1.25" className="wordmark__line" />
      </svg>
      {APP_NAME}
    </h1>
  );
}

function MapPlaceholder() {
  return (
    <div className="map-placeholder">
      <p className="map-placeholder__label">The map appears here.</p>
    </div>
  );
}
