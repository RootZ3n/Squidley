import type { ModuleTour } from "./types";

export const fabricaTour: ModuleTour = {
  moduleId: "fabrica",
  moduleName: "Fabrica",
  steps: [
    {
      id: "intro",
      target: "intro",
      title: "Welcome to Fabrica",
      body: '"Fabrica" means workshop. Public Fabrica helps you practice small single-file building tasks.',
    },
    {
      id: "local",
      target: "local-only-indicator",
      title: "Local-only workshop",
      body: "Fabrica asks your local model server for suggestions. No cloud fallback is used.",
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
      body: "Keep the request narrow. Fabrica is not a repo-wide coding agent.",
    },
    {
      id: "model",
      target: "fabrica-model",
      title: "Local model choice",
      body: "Fabrica uses the local model preference from Nous, with a local fallback when needed.",
    },
    {
      id: "limits",
      target: "fabrica-limits",
      title: "Public limits",
      body: "Fabrica does not run shell commands, use tools, or write files automatically.",
    },
    {
      id: "output",
      target: "fabrica-output",
      title: "Review the suggestion",
      body: "The result is only text on the page. You decide whether to copy or export it.",
    },
  ],
};
