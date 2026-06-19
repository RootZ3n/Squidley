# Pehlichi Public

**The public version of Pehlichi — a feudal Japan world engine with agent runtime, teaching modules, and local-first AI workspace.**

Pehlichi is your guide through the world of AI. A coordinator, a teacher, a squirrel with a thousand lives. This public version merges Pehlichi's core agent runtime with peh-pub's teaching modules, wrapped in a feudal Japanese village UI.

## What is Pehlichi?

Pehlichi is the coordinator of the Pehverse — an AI agent that studies, guides, and remembers. It lives in a world engine: a spatial UI where every location represents a different capability.

- **The agent runtime** — the core loop, tools, drivers, bridges, and skills that make Pehlichi think and act
- **The world engine** — a spatial UI where you navigate a feudal Japanese village, each location a different module
- **The teaching system** — lessons, concepts, and onboarding that make AI accessible to beginners
- **Local-first** — runs on your machine with local models (Ollama, llama.cpp) or cloud providers

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

## License

Apache-2.0

---

*"Welcome to the village. I am Peh — your guide. Come, let me show you around."*
