import type { ModuleTour } from "./types";
import { colloquiumTour } from "./colloquium";

export type { ModuleTour, TourStep } from "./types";

export const TOURS: Record<string, ModuleTour> = {
  colloquium: colloquiumTour,
};

export function getTour(moduleId: string): ModuleTour | undefined {
  return TOURS[moduleId];
}
