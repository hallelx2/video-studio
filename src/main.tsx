import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createHashRouter, Navigate } from "react-router-dom";
import { App } from "./App.js";
import { ProjectsRoute } from "./routes/Projects.js";
import { WorkbenchRoute } from "./routes/Workbench.js";
import { SettingsRoute } from "./routes/Settings.js";
import { OnboardingRoute } from "./routes/Onboarding.js";
import { ErrorBoundary } from "./routes/ErrorBoundary.js";
import "./index.css";

// Hash routing instead of browser routing: in a Tauri bundle the initial URL is
// something like `tauri://localhost/index.html`, which browser routing can't match.
// Hash routing stays anchored to the page so navigation works consistently in dev,
// bundled installer, and when react-router rehydrates from any unexpected URL.
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
      { index: true, element: <ProjectsRoute /> },
      { path: "project/:productId", element: <WorkbenchRoute /> },
      { path: "settings", element: <SettingsRoute /> },
    ],
  },
  // Catch-all: anything that didn't match, redirect home so we never 404.
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
