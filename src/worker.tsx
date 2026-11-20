import { render, route } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";

import { Document } from "@/app/document";
import { setCommonHeaders } from "@/app/headers";
import { Home } from "@/app/pages/home";
import { Styleguide, StyleguideForm } from "@/app/pages/styleguide";

export type AppContext = {};

// /_styleguide and /_styleguide/form are review tools, registered only on the
// Vite dev server (`npm run dev`). Production builds do not route them (404).
const devRoutes = import.meta.env.VITE_IS_DEV_SERVER
  ? [route("/_styleguide", Styleguide), route("/_styleguide/form", StyleguideForm)]
  : [];

export default defineApp([
  setCommonHeaders(),
  ({ ctx }) => {
    // setup ctx here
    ctx;
  },
  render(Document, [route("/", Home), ...devRoutes]),
]);
