> **⚠️ LAB-ONLY PRODUCT — AUTHENTICATION IS YOUR RESPONSIBILITY**
>
> This tool is designed for **local/lab use only**. It binds to localhost by default
> and is meant to run behind Tailscale, a VPN, or on a private network.
>
> **If you expose any service to the public internet, YOU are responsible for
> securing it.** No authentication, rate-limiting, or access control will be added
> to this product. That is not a bug — it is a design decision.
>
> Expose at your own risk.

# Pehlichi

**A feudal Japan world engine for AI — your guide lives in a spatial village where every location is a different capability.**

```bash
npm install
```

## What is this?

Pehlichi is an open-source AI workspace wrapped in a feudal Japanese village. Your AI guide — Pehlichi — lives inside a spatial UI where each location in the village is a different capability: a Tea House for chat, a Dojo for learning, a Forge for code, a Garden for notes, and more.

Under the hood it's three things:

- **An agent runtime** — a core loop with tools, drivers, bridges, and skills that let Pehlichi think and act
- **A teaching system** — lessons, concepts, and onboarding that make AI accessible to beginners
- **A local-first workspace** — everything runs on your machine by default using Ollama or llama.cpp; cloud providers are optional

It's built with Next.js and packaged as an Electron desktop app for Windows, macOS, and Linux.

## What is Peh?

Peh is an open-source AI ecosystem. Pehlichi is one piece of it. The sibling projects:

| Repo | What it does |
|------|-------------|
| [velum](https://github.com/RootZ3n/velum) | Privacy and security layer |
| [ikbi](https://github.com/RootZ3n/ikbi) | Knowledge and memory |
| [kokuli](https://github.com/RootZ3n/kokuli) | Conversation and dialogue |
| [luak](https://github.com/RootZ3n/luak) | Scripting and automation |

---

## Installation

```bash
npm install
```

### Development

```bash
# Web dev server
npm run dev

# Electron desktop app
npm run electron:dev
```

### Testing

```bash
# Run Next.js/vitest tests
npm test

# Run core agent runtime tests
npm run test:core

# Type check
npm run typecheck
```

## Architecture

```
pehlichi-pub/
├── src/
│   ├── core/              # Agent runtime (loop, tools, drivers, bridges, sinks)
│   ├── app/               # Next.js pages and API routes
│   ├── components/        # React components
│   ├── lib/               # Library modules (teacher, chat, planning, etc.)
│   ├── tools/             # Bridge tools
│   ├── cli/               # CLI REPL
│   ├── profile.ts         # Agent profile with team awareness
│   └── index.ts           # Main entry point
├── ui/                    # World engine (HTML/CSS/JS)
│   ├── index.html         # Feudal Japan world engine
│   ├── pehlichi.css       # Feudal Japan theme
│   └── assets/            # Map images, mascot art
├── tui/                   # Terminal UI
│   ├── skin.yaml          # Feudal Japan TUI theme
│   └── src/               # TUI source
├── skills/                # Agent skills
├── personality/           # Peh's personality (peh.yaml)
├── electron/              # Electron packaging
├── docs/                  # Documentation
├── scripts/               # Build and test scripts
└── reports/               # Test reports
```

## The Village — World Engine Locations

| Location | Module | What it does |
|----------|--------|-------------|
| **Torii Gate** | Hub | Village overview, navigation |
| **The Dojo** | Teacher | Lessons, concepts, onboarding |
| **Castle Tower** | Settings | Configuration, model setup |
| **The Forge** | Workshop | Code suggestions, diagnostics |
| **Tea House** | Chat | Conversation, local models |
| **The Garden** | Notebook | Notes, memory |
| **The Shrine** | Insights | Diagnostics, assessment |
| **Scroll Room** | Activity Log | Receipts, action history |
| **Strategy Pavilion** | Planning | Plans, missions |
| **Watch Tower** | Vision | Code analysis, monitoring |
| **Shield Gate** | Velum | Privacy, security |

## Color Scheme

The feudal Japan palette:
- **Primary**: Deep red (#8B0000 / crimson)
- **Accent**: Gold (#C8A951)
- **Background**: Warm paper (#F5E6C8)
- **Text**: Dark ink (#2C1810)
- **Borders**: Bamboo (#8B7355)
- **Highlights**: Cherry blossom pink (#FFB7C5)

## Local-First

Pehlichi Public runs entirely on your machine. No data leaves your computer unless you explicitly choose cloud mode. Local models (via Ollama or llama.cpp) are the default.

Ollama is validated end-to-end. The real `llama-server` binary still needs manual validation, so llama.cpp text support is treated as pending.

## Release Status

**NOT RELEASE READY.** This build is a local-mode subsystem, not the finished product. Cloud mode is architecture-only and does not ship until it actually works.

- Phased plan and gating criteria: [docs/PUBLIC_PEH_RELEASE_PLAN.md](docs/PUBLIC_PEH_RELEASE_PLAN.md)
- Teacher-first product doctrine: [docs/TEACHER_FIRST_DOCTRINE.md](docs/TEACHER_FIRST_DOCTRINE.md)

## License

Apache-2.0

---

*"Welcome to the village. I am Peh — your guide. Come, let me show you around."*
