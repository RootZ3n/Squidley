import Image from "next/image";

/**
 * Squidley mascot.
 *
 * Renders the official mascot image from /public/squidley/squidley.png inside
 * a soft rounded portrait frame. The image is portrait orientation (2:3); we
 * use the natural aspect ratio and let `size` control the height. A subtle
 * gradient halo and shadow make the framed mascot look intentional on light
 * and dark backgrounds.
 */

const MASCOT_SRC = "/squidley/squidley.png";
// Natural dimensions of the source image — used to compute width from height.
const NATURAL_W = 1024;
const NATURAL_H = 1536;

interface SquidleyMascotProps {
  /** Height in px. Width is derived from the image's 2:3 aspect ratio. */
  size?: number;
  className?: string;
  title?: string;
  /** Wrap in a soft rounded portrait frame. Defaults to true. */
  framed?: boolean;
  /** Apply a gentle breathing animation. Defaults to false. */
  animated?: boolean;
  /** Hint to the loader that this image is high-priority (e.g. above the fold). */
  priority?: boolean;
}

export function SquidleyMascot({
  size = 200,
  className = "",
  title = "Squidley",
  framed = true,
  animated = false,
  priority = false,
}: SquidleyMascotProps) {
  const height = size;
  const width = Math.round((size * NATURAL_W) / NATURAL_H);

  const motion = animated ? "motion-safe:animate-breathe" : "";
  const frame = framed
    ? "overflow-hidden rounded-[28%] shadow-[0_18px_40px_-18px_rgba(20,26,48,0.45)] ring-1 ring-iris-200/60 dark:ring-iris-800/40"
    : "";

  return (
    <div
      className={`relative inline-block ${frame} ${motion} ${className}`}
      style={{ width, height }}
      aria-label={title}
      role="img"
    >
      <Image
        src={MASCOT_SRC}
        alt={title}
        width={width}
        height={height}
        priority={priority}
        sizes={`${width}px`}
        className="h-full w-full select-none object-cover"
        draggable={false}
      />
    </div>
  );
}

export default SquidleyMascot;
