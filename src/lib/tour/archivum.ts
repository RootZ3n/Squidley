import type { ModuleTour } from "./types";

export const archivumTour: ModuleTour = {
  moduleId: "archivum",
  moduleName: "Archivum",
  steps: [
    {
      id: "intro",
      target: "intro",
      title: "Welcome to Archivum",
      body: '"Archivum" means archive or records. This is your local knowledge shelf for notes, snippets, and pasted documents.',
    },
    {
      id: "more-input",
      target: "more-input-form",
      title: "More Input",
      body: "More Input is the friendly way to bring text into Peh. In this public pass, it is manual paste only and stays in your browser.",
    },
    {
      id: "fields",
      target: "more-input-form",
      title: "Title, type, and text",
      body: "Add a title if you want, choose a simple type, then paste the text you want to save locally.",
    },
    {
      id: "velum-review",
      target: "archivum-velum-review",
      title: "Review in Velum first",
      body: "Before saving, you can send the draft to Velum for a local safety review. Nothing is saved automatically.",
    },
    {
      id: "save",
      target: "archivum-save",
      title: "Save only when ready",
      body: "Saving is explicit. More Input does not store the draft until you choose Save to Archivum.",
    },
    {
      id: "local-storage",
      target: "local-only-indicator",
      title: "Local-only storage",
      body: "Archivum stores entries in this browser. There is no cloud sync, vector database, or background import.",
    },
    {
      id: "entries",
      target: "archivum-list",
      title: "Saved entries",
      body: "Saved entries show title, type, local-only state, and whether Velum reviewed them.",
    },
    {
      id: "badges",
      target: "archivum-badges",
      title: "Reviewed and unreviewed badges",
      body: "Badges remind you whether an entry stayed local and whether it was reviewed in Velum.",
    },
    {
      id: "details",
      target: "archivum-entry-detail",
      title: "Delete and export",
      body: "You can view details, export one entry locally, or delete an entry from this browser.",
    },
    {
      id: "actions",
      target: "archivum-entry-actions",
      title: "Entry controls",
      body: "Edit, export, and delete are all local actions. Editing text may reset Velum review until you review it again.",
    },
  ],
};
