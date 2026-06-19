import type { ModuleTour } from "./types";

export const workshopTour: ModuleTour = {
  moduleId: "fabrica",
  moduleName: "Workshop",
  steps: [
    {
      id: "intro",
      target: "intro",
      title: "Welcome to Workshop",
      body: '"Workshop" means workshop. Public Workshop helps you practice small single-file building tasks.',
    },
    {
      id: "local",
      target: "local-only-indicator",
      title: "Local-only workshop",
      body: "Workshop asks your local model server for suggestions. No cloud fallback is used.",
    },
    {
      id: "inputs",
      target: "fabrica-inputs",
      title: "One file only",
      body: "Paste one file, or leave the original content blank to start from scratch.",
    },
    {
      id: "change",
      target: "fabrica-change",
      title: "Describe a small change",
      body: "Keep the request narrow. Workshop is not a repo-wide coding agent.",
    },
    {
      id: "model",
      target: "fabrica-model",
      title: "Local model choice",
      body: "Workshop uses the local model preference from Insights, with a local fallback when needed.",
    },
    {
      id: "limits",
      target: "fabrica-limits",
      title: "Public limits",
      body: "Workshop does not run shell commands, use tools, or write files automatically.",
    },
    {
      id: "output",
      target: "fabrica-output",
      title: "Review the suggestion",
      body: "The result is only text on the page. You decide whether to copy or export it.",
    },
  ],
};
