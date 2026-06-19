/**
 * Runtime teaching explanation helper.
 *
 * Produces contextual, beginner-friendly explanations for runtime events
 * using the registered teaching hooks and concept registry.
 */

import type { RuntimeTeachingEvent } from "./types";
import { getHookByEvent } from "./runtimeHooks";
import { getConceptById } from "./concepts";

export interface RuntimeExplanation {
  event: RuntimeTeachingEvent;
  whatHappened: string;
  whyItMatters: string;
  whatYouCanDoNext: string;
  conceptSummaries: readonly { id: string; title: string; brief: string }[];
  docsLink?: string;
}

/**
 * Get a contextual teaching explanation for a runtime event.
 *
 * Returns a structured explanation with concept summaries, or null
 * if no hook is registered for the event.
 */
export function getRuntimeTeachingExplanation(
  event: RuntimeTeachingEvent,
): RuntimeExplanation | null {
  const hook = getHookByEvent(event);
  if (!hook) return null;

  const conceptSummaries = hook.conceptIds
    .map((id) => {
      const concept = getConceptById(id);
      if (!concept) return null;
      return {
        id: concept.id,
        title: concept.title,
        brief: concept.plainLanguageDefinition,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  return {
    event: hook.event,
    whatHappened: hook.whatHappened,
    whyItMatters: hook.whyItMatters,
    whatYouCanDoNext: hook.whatYouCanDoNext,
    conceptSummaries,
    docsLink: hook.docsLink,
  };
}
