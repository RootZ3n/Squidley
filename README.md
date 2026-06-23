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

1|# Pehlichi Public
2|
3|**The public version of Pehlichi — a feudal Japan world engine with agent runtime, teaching modules, and local-first AI workspace.**
4|
5|Pehlichi is your guide through the world of AI. A coordinator, a teacher, a squirrel with a thousand lives. This public version merges Pehlichi's core agent runtime with peh-pub's teaching modules, wrapped in a feudal Japanese village UI.
6|
7|## What is Pehlichi?
8|
9|Pehlichi is the coordinator of the Pehverse — an AI agent that studies, guides, and remembers. It lives in a world engine: a spatial UI where every location represents a different capability.
10|
11|- **The agent runtime** — the core loop, tools, drivers, bridges, and skills that make Pehlichi think and act
12|- **The world engine** — a spatial UI where you navigate a feudal Japanese village, each location a different module
13|- **The teaching system** — lessons, concepts, and onboarding that make AI accessible to beginners
14|- **Local-first** — runs on your machine with local models (Ollama, llama.cpp) or cloud providers
15|
16|## Installation
17|
18|```bash
19|npm install
20|```
21|
22|### Development
23|
24|```bash
25|# Web dev server
26|npm run dev
27|
28|# Electron desktop app
29|npm run electron:dev
30|```
31|
32|### Testing
33|
34|```bash
35|# Run Next.js/vitest tests
36|npm test
37|
38|# Run core agent runtime tests
39|npm run test:core
40|
41|# Type check
42|npm run typecheck
43|```
44|
45|## Architecture
46|
47|```
48|pehlichi-pub/
49|├── src/
50|│   ├── core/              # Agent runtime (loop, tools, drivers, bridges, sinks)
51|│   ├── app/               # Next.js pages and API routes
52|│   ├── components/        # React components
53|│   ├── lib/               # Library modules (teacher, chat, planning, etc.)
54|│   ├── tools/             # Bridge tools
55|│   ├── cli/               # CLI REPL
56|│   ├── profile.ts         # Agent profile with team awareness
57|│   └── index.ts           # Main entry point
58|├── ui/                    # World engine (HTML/CSS/JS)
59|│   ├── index.html         # Feudal Japan world engine
60|│   ├── pehlichi.css       # Feudal Japan theme
61|│   └── assets/            # Map images, mascot art
62|├── tui/                   # Terminal UI
63|│   ├── skin.yaml          # Feudal Japan TUI theme
64|│   └── src/               # TUI source
65|├── skills/                # Agent skills
66|├── personality/           # Peh's personality (peh.yaml)
67|├── electron/              # Electron packaging
68|├── docs/                  # Documentation
69|├── scripts/               # Build and test scripts
70|└── reports/               # Test reports
71|```
72|
73|## The Village — World Engine Locations
74|
75|| Location | Module | What it does |
76||----------|--------|-------------|
77|| **Torii Gate** | Hub | Village overview, navigation |
78|| **The Dojo** | Teacher | Lessons, concepts, onboarding |
79|| **Castle Tower** | Settings | Configuration, model setup |
80|| **The Forge** | Workshop | Code suggestions, diagnostics |
81|| **Tea House** | Chat | Conversation, local models |
82|| **The Garden** | Notebook | Notes, memory |
83|| **The Shrine** | Insights | Diagnostics, assessment |
84|| **Scroll Room** | Activity Log | Receipts, action history |
85|| **Strategy Pavilion** | Planning | Plans, missions |
86|| **Watch Tower** | Vision | Code analysis, monitoring |
87|| **Shield Gate** | Velum | Privacy, security |
88|
89|## Color Scheme
90|
91|The feudal Japan palette:
92|- **Primary**: Deep red (#8B0000 / crimson)
93|- **Accent**: Gold (#C8A951)
94|- **Background**: Warm paper (#F5E6C8)
95|- **Text**: Dark ink (#2C1810)
96|- **Borders**: Bamboo (#8B7355)
97|- **Highlights**: Cherry blossom pink (#FFB7C5)
98|
99|## Local-First
100|
101|Pehlichi Public runs entirely on your machine. No data leaves your computer unless you explicitly choose cloud mode. Local models (via Ollama or llama.cpp) are the default.
102|
103|Ollama is validated end-to-end. The real `llama-server` binary still needs manual validation, so llama.cpp text support is treated as pending.
104|
105|## Release Status
106|
107|**NOT RELEASE READY.** This build is a local-mode subsystem, not the finished product. Cloud mode is architecture-only and does not ship until it actually works.
108|
109|- Phased plan and gating criteria: [docs/PUBLIC_PEH_RELEASE_PLAN.md](docs/PUBLIC_PEH_RELEASE_PLAN.md)
110|- Teacher-first product doctrine: [docs/TEACHER_FIRST_DOCTRINE.md](docs/TEACHER_FIRST_DOCTRINE.md)
111|
112|## License
113|
114|Apache-2.0
115|
116|---
117|
118|*"Welcome to the village. I am Peh — your guide. Come, let me show you around."*
119|