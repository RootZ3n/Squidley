import type { ModuleTour } from "./types";

export const oculusTour: ModuleTour = {
  moduleId: "oculus",
  moduleName: "Oculus",
  steps: [
    {
      id: "intro",
      target: "intro",
      title: "Welcome to Oculus",
      body: '"Oculus" means eye. This page helps Squidley look at an image or screenshot you choose manually.',
    },
    {
      id: "privacy",
      target: "local-only-indicator",
      title: "Manual and local-first",
      body: "Oculus does not watch your screen, use your camera, or upload images to cloud vision.",
    },
    {
      id: "picker",
      target: "oculus-picker",
      title: "Choose an image",
      body: "Pick a PNG, JPG, or WebP file yourself. The preview stays in your browser.",
    },
    {
      id: "preview",
      target: "oculus-preview",
      title: "Preview before analysis",
      body: "Review the image and file details before asking a local model to analyze it.",
    },
    {
      id: "vision",
      target: "oculus-vision",
      title: "Local vision model",
      body: "Oculus uses a simple model-name hint to check whether the selected local model may support images.",
    },
    {
      id: "result",
      target: "oculus-result",
      title: "Analysis result",
      body: "If analysis runs, the result appears here and Tabularium records a local receipt.",
    },
    {
      id: "handoff",
      target: "oculus-handoff",
      title: "Send text to Colloquium",
      body: "Only the analysis text can be handed to Colloquium. The image itself is not sent in the handoff.",
    },
  ],
};
