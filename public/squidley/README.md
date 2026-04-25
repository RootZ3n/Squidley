# Squidley mascot assets

This folder is the canonical drop-in location for the official Squidley
mascot artwork.

## What goes here

Place the real mascot files here. Recommended file names:

- `mascot.svg`        — primary vector mascot (preferred for crisp scaling).
- `mascot.png`        — raster fallback, ideally 1024×1024 with transparent background.
- `mascot-small.png`  — small bitmap (256×256) for header/inline use.

## Usage

The app imports the mascot through `<SquidleyMascot />`
(`src/components/SquidleyMascot.tsx`).

That component currently renders an inline SVG **placeholder**.
When the real artwork is dropped in here, update `SquidleyMascot.tsx`
to render an `<Image src="/squidley/mascot.svg" ... />` (Next.js `Image`)
or a plain `<img>` and remove the placeholder SVG.

## Do not

- Do not commit private/internal mascot variants from the lab build.
- Do not generate mascots from external image services in this repo.
