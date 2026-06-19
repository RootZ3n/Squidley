import type { ModuleTour } from "./types";
import { notebookTour } from "./notebook";
import { chatTour } from "./chat";
import { workshopTour } from "./workshop";
import { visionTour } from "./vision";
import { insightsTour } from "./insights";
import { activityLogTour } from "./activity-log";
import { velumTour } from "./velum";

export type { ModuleTour, TourStep } from "./types";

export const TOURS: Record<string, ModuleTour> = {
  notebook: notebookTour,
  chat: chatTour,
  workshop: workshopTour,
  insights: insightsTour,
  vision: visionTour,
  "activity-log": activityLogTour,
  velum: velumTour,
};

export function getTour(moduleId: string): ModuleTour | undefined {
  return TOURS[moduleId];
}
