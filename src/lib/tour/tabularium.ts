import type { ModuleTour } from "./types";

export const tabulariumTour: ModuleTour = {
  moduleId: "tabularium",
  moduleName: "Tabularium",
  steps: [
    {
      id: "intro",
      target: "intro",
      title: "Welcome to Tabularium",
      body: '"Tabularium" means record room. This page shows local receipts so you can see what Squidley did.',
    },
    {
      id: "local",
      target: "local-only-indicator",
      title: "Local receipts",
      body: "Receipts are saved in this browser. They show local-only and no-cloud badges so the boundary is clear.",
    },
    {
      id: "filters",
      target: "tabularium-filters",
      title: "Search and filter",
      body: "Use filters to narrow receipts by module, status, or whether a local model was used.",
    },
    {
      id: "list",
      target: "tabularium-list",
      title: "Receipt timeline",
      body: "Each receipt summarizes one visible action, such as a chat reply, Velum review, or Archivum save.",
    },
    {
      id: "details",
      target: "tabularium-detail",
      title: "Receipt details",
      body: "Details show timestamps, local-only state, model use, and safe summaries without storing full pasted text.",
    },
    {
      id: "actions",
      target: "tabularium-actions",
      title: "Export or clear",
      body: "Export and clear are local browser actions. Nothing is uploaded.",
    },
  ],
};
