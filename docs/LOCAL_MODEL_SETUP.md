# Local Model Setup

Public Squidley uses a local model server for Colloquium, Oculus, and
Fabrica. Ollama is validated end-to-end. Colloquium and Fabrica can also use an
OpenAI-compatible local text backend for llama.cpp/llama-server, but a real
`llama-server` binary still needs manual validation. Oculus vision is
Ollama-only in this release. No cloud fallback is active.

## Defaults

By default, Squidley expects:

```text
SQUIDLEY_LOCAL_ENDPOINT=http://localhost:11434
SQUIDLEY_LOCAL_MODEL=llama3.2
SQUIDLEY_LOCAL_BACKEND=auto
```

These are server-side environment variables. They are not cloud credentials.

See `.env.example` for the supported variables.

## Install and Start Ollama

Install Ollama from:

```text
https://ollama.com/download
```

After installation, Ollama usually starts as a local service. If needed, start it
manually:

```bash
ollama serve
```

## Pull a Chat Model

For the default public demo:

```bash
ollama pull llama3.2
```

Then start Squidley:

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Pull a Vision Model for Oculus

Oculus image analysis needs Ollama plus a local vision-capable model. Example
options:

```bash
ollama pull llava
```

or another local vision model such as `moondream`, `minicpm-v`, `qwen-vl`, or a
vision-capable model available in your Ollama setup.

Oculus uses a simple model-name heuristic. It may not detect every vision model.
llama.cpp/llama-server vision is not supported in this release.

## Optional llama.cpp Text Backend

Squidley has an OpenAI-compatible local text path for llama.cpp/llama-server.
This path has been tested through Ollama's OpenAI-compatible endpoint. A real
`llama-server` binary has not yet been validated on this release machine, so
keep it labeled as pending real-machine validation.

Example configuration:

```text
SQUIDLEY_LOCAL_BACKEND=llama-cpp
SQUIDLEY_LOCAL_ENDPOINT=http://localhost:8080
SQUIDLEY_LOCAL_MODEL=your-model-id
```

Example server command for manual validation:

```bash
llama-server -m your-model.gguf --port 8080
```

## Changing Local Models

Use Nous at `/nous` to choose browser-local model preferences for:

- Colloquium chat
- Oculus vision
- Fabrica single-file suggestions

Page-level selectors on those modules save back to the same browser-local Nous
preference store.

## What Is Not Configured Here

This public pass does not support:

- cloud provider API keys
- cloud fallback
- accounts or billing
- telemetry upload
- backend database storage

Nous includes cloud provider metadata only so future cloud unlock work has a
clear registry. Those providers remain locked/off by default.
