import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import React from "react";
import ReactDOM from "react-dom/client";
import { Landing } from "@/App";
import { DocPage, DocsIndex, DocsLayout } from "@/routes/docs";
import "@/index.css";

const rootRoute = createRootRoute({ component: Outlet });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Landing });
const docsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/docs", component: DocsLayout });
const docsIndexRoute = createRoute({ getParentRoute: () => docsRoute, path: "/", component: DocsIndex });
const docPageRoute = createRoute({ getParentRoute: () => docsRoute, path: "$slug", component: DocPage });

const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    docsRoute.addChildren([docsIndexRoute, docPageRoute]),
  ]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// biome-ignore lint: root exists in index.html
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
