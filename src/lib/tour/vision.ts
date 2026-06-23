import type { ModuleTour } from "./types";

export const visionTour: ModuleTour = {
  moduleId: "vision",
  moduleName: "Vision",
  steps: [
    {
      id: "intro",
      target: "intro",
      title: "Welcome to Vision",
      body: '"Vision" means eye. This page helps Peh look at an image or screenshot you choose manually.',
    },
    {
      id: "privacy",
      target: "local-only-indicator",
      title: "Manual and local-first",
      body: "Vision does not watch your screen, use your camera, or upload images to cloud vision.",
    },
    {
      id: "picker",
      target: "vision-picker",
      title: "Choose an image",
      body: "Pick a PNG, JPG, or WebP file yourself. The preview stays in your browser.",
    },
    {
      id: "preview",
      target: "vision-preview",
      title: "Preview before analysis",
      body: "Review the image and file details before asking a local model to analyze it.",
    },
    {
      id: "vision",
      target: "vision-vision",
      title: "Local vision model",
      body: "Vision uses a simple model-name hint to check whether the selected local model may support images.",
    },
    {
      id: "result",
      target: "vision-result",
      title: "Analysis result",
      body: "If analysis runs, the result appears here and ActivityLog records a local receipt.",
    },
    {
      id: "handoff",
      target: "vision-handoff",
      title: "Send text to Chat",
      body: "Only the analysis text can be handed to Chat. The image itself is not sent in the handoff.",
    },
  ],
};
