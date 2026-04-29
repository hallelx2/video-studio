import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createHashRouter, Navigate } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import { App } from "./App.js";
import { HomeRoute } from "./routes/Home.js";
import { ProjectsRoute } from "./routes/Projects.js";
import { WorkbenchRoute } from "./routes/Workbench.js";
import { StageRoute } from "./routes/Stage.js";
import { PlaygroundRoute } from "./routes/Playground.js";
import { SettingsRoute } from "./routes/Settings.js";
import { OnboardingRoute } from "./routes/Onboarding.js";
import { ErrorBoundary } from "./routes/ErrorBoundary.js";
import "./index.css";

// Hash routing — required because Electron loads the bundle via `file://` in
// production. Browser routing breaks against file:// URLs, but hash routing
// stays anchored to the page so navigation works in dev (Vite), in the
// packaged installer, and when react-router rehydrates from any unexpected URL.
const router = createHashRouter([
  {
    path: "/onboarding",
    element: <OnboardingRoute />,
    errorElement: <ErrorBoundary />,
  },
  {
    path: "/",
    element: <App />,
    errorElement: <ErrorBoundary />,
    children: [
      // Home is the landing surface — greeting + recent activity + browse.
      { index: true, element: <HomeRoute /> },
      // Full project picker, reachable from Home and from anywhere via the
      // breadcrumb / sidebar.
      { path: "projects", element: <ProjectsRoute /> },
      // Stage is the new preview-first surface; the legacy chat-style
      // Workbench remains reachable via ?legacy=1 for one cycle so power
      // users have a fallback while the inversion settles.
      { path: "project/:productId", element: <ProjectViewSwitch /> },
      // Playground = a workbench that's not anchored to any source project.
      { path: "playground", element: <PlaygroundRoute /> },
      { path: "settings", element: <SettingsRoute /> },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);

function ProjectViewSwitch() {
  const [params] = useSearchParams();
  return params.get("legacy") === "1" ? <WorkbenchRoute /> : <StageRoute />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
