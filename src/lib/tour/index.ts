import type { ModuleTour } from "./types";
import { archivumTour } from "./archivum";
import { colloquiumTour } from "./colloquium";
import { fabricaTour } from "./fabrica";
import { oculusTour } from "./oculus";
import { nousTour } from "./nous";
import { tabulariumTour } from "./tabularium";
import { velumTour } from "./velum";

export type { ModuleTour, TourStep } from "./types";

export const TOURS: Record<string, ModuleTour> = {
  archivum: archivumTour,
  colloquium: colloquiumTour,
  fabrica: fabricaTour,
  nous: nousTour,
  oculus: oculusTour,
  tabularium: tabulariumTour,
  velum: velumTour,
};

export function getTour(moduleId: string): ModuleTour | undefined {
  return TOURS[moduleId];
}
