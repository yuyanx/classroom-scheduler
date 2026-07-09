import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import VolunteerApp from "./VolunteerApp.jsx";
import { isEntryMode } from "./entryMode.js";

const entry = typeof window !== "undefined" && isEntryMode(window.location.search);
if (entry && typeof document !== "undefined") {
  document.title = "Premier Plus · Class entry";
}

createRoot(document.getElementById("root")).render(
  entry ? <VolunteerApp /> : <App />
);
