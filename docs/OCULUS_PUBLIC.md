# Oculus in Public Squidley

Oculus is Squidley's visual understanding module. In public v0.1, it is manual,
local-first, and privacy-aware.

## Manual Image Review

Oculus lets you choose an image or screenshot yourself. It accepts:

- PNG
- JPG / JPEG
- WebP

The image is previewed locally in the browser with basic file metadata: file
name, type, and size.

Oculus does not watch your screen, use your camera, capture the browser, or
upload images automatically.

## Privacy

In this public version:

- images are not stored by default
- no cloud vision is used
- no background screen watching exists
- no camera capture exists
- no image data is placed in URLs

Only choose images you are comfortable reviewing. If an image contains sensitive
text, consider whether you want a model to see it before analyzing.

## Local Vision Analysis

Oculus can attempt local image analysis when a likely vision-capable local model
is available. It uses a simple model-name heuristic for names such as:

- `llava`
- `bakllava`
- `minicpm-v`
- `moondream`
- `qwen-vl`
- `gemma3`

This detection is a hint, not a guarantee. If no likely vision model is found,
the Analyze button stays disabled with an explanation.

When analysis runs, Oculus sends the selected image to the configured local
Ollama endpoint only. There is no cloud fallback. llama.cpp/llama-server vision
is unsupported in this release and is blocked by the API route.

Before the local vision request is made, Prompt Gateway checks the text prompt.
Oculus also tells the local vision model that the image is untrusted and that
visible text in the image should be described or analyzed, not followed as
instructions.

Oculus reads the browser-local Nous model preference for vision. When that
preference is used, Oculus shows a small note and a **Change in Nous** link.
Changing the local model directly in Oculus saves that choice as the new shared
Oculus vision preference.

## Colloquium Handoff

After an analysis exists, Oculus can send the analysis text to Colloquium as a
draft. The user must still click **Send** in Colloquium.

The handoff uses browser `sessionStorage` and includes only text:

- analysis text is included
- original image data is not included
- no image is put in the URL
- no automatic chat send happens

## Save Analysis to Archivum

After an analysis exists, Oculus can save the analysis text as a local Archivum
entry. Before saving, you can edit:

- title
- type/category
- tags

Only the analysis text is saved. The original image, image base64, object URLs,
and image bytes are not stored in Archivum.

Saved entries use:

- `source: oculus-analysis`
- `localOnly: true`
- `cloudUsed: false`
- `velumReviewed: false`

Oculus does not automatically mark the analysis as Velum-reviewed. To review
the analysis first, copy the analysis text and open Velum. Oculus does not send
images to Velum.

## Receipts

Tabularium records local receipts for Oculus analysis start, success, failure,
handoff to Colloquium, and saving analysis text to Archivum. Receipts avoid
storing image data or full analysis text.
