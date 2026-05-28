import type { ModuleTour } from "./types";

export const nousTour: ModuleTour = {
  moduleId: "nous",
  moduleName: "Nous",
  steps: [
    {
      id: "intro",
      target: "intro",
      title: "Welcome to Nous",
      body: '"Nous" means understanding. This page maps Peh modules, model use, and local-only boundaries.',
    },
    {
      id: "local",
      target: "local-only-indicator",
      title: "Local-only right now",
      body: "Peh currently uses local model behavior only. No cloud fallback is active.",
    },
    {
      id: "models",
      target: "nous-model-controls",
      title: "Local model assignments",
      body: "Choose which discovered local model Colloquium uses for chat and which model Oculus should try for vision.",
    },
    {
      id: "ratio",
      target: "nous-asi",
      title: "Adaptive System Intelligence",
      body: "Ratio is Peh's Adaptive System Intelligence layer. It explains how model strength, unlock level, permissions, and safety risk change what Peh can do.",
    },
    {
      id: "map",
      target: "nous-module-map",
      title: "Module map",
      body: "Each card explains whether a module uses a model, which role that model has, and whether the module is wired today.",
    },
    {
      id: "providers",
      target: "nous-provider-registry",
      title: "Provider registry",
      body: "Provider entries define metadata for local and future cloud providers. Locked entries are not used by Peh.",
    },
    {
      id: "cloud-lock",
      target: "nous-cloud-lock",
      title: "Prepared but locked",
      body: "Cloud providers are prepared for a future explicit unlock. This pass collects no API keys and makes no cloud calls.",
    },
  ],
};
