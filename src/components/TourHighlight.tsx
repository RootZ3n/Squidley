"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Wrap a region with a tour-able id. When the tour's active target matches
 * `target`, the region gets a soft pulsing glow and scrolls into view.
 *
 * Visual choice: pulsing glow rather than a hard ring keeps the page feeling
 * calm — the eye is drawn without the screen feeling like a form-validation
 * error state.
 */
export function TourHighlight({
  target,
  active,
  className = "",
  children,
}: {
  target: string;
  active: string | null;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const isActive = active === target;

  useEffect(() => {
    if (!isActive || !ref.current) return;
    const el = ref.current;
    // Defer one frame so layout is stable before scrolling.
    const id = window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [isActive]);

  return (
    <div
      ref={ref}
      data-tour={target}
      className={`rounded-xl transition-shadow ${
        isActive ? "motion-safe:animate-tour-glow" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export default TourHighlight;
