# Local Models

## What is a Local Model?

A local model runs on your own computer. Your text never leaves your machine.
It is free to use, completely private, and works without an internet connection.

## Ollama

Ollama is a program that makes it easy to download and run AI models locally.
It is the recommended way to use Squidley in Local Mode.

**Getting started:**
1. Install Ollama from ollama.com
2. Pull a model: `ollama pull llama3.2`
3. Start the server: `ollama serve`
4. Open Squidley — it will connect automatically

## llama.cpp / llama-server

llama.cpp is another option for running models locally. It uses GGUF model
files and provides an OpenAI-compatible API. It is more flexible but harder
to set up than Ollama. Start with Ollama unless you have a reason to use
llama.cpp.

## Trade-offs

| | Local Models | Cloud Models |
|--|-------------|-------------|
| Privacy | Everything stays on your machine | Text goes to a company's server |
| Cost | Free | Pay per token |
| Quality | Depends on model size | Usually higher (larger models) |
| Speed | Depends on your hardware | Usually fast |
| Offline | Works offline | Requires internet |

## Check Your Understanding

- What are the advantages of running a model locally?
- What is Ollama and how do you install it?
- Why might a local model give shorter or simpler answers?
