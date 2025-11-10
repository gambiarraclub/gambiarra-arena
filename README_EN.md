# 🎮 Gambiarra LLM Club Arena Local
```
╱╭━━━╮╱╭━━━╮╱╭━╮╭━╮╱╭━━╮╱╱╭━━╮╱╭━━━╮╱╭━━━╮╱╭━━━╮╱╭━━━╮╱╱╱╱╱╭━━━╮╱╭━━━╮╱╭━━━╮╱╭━╮╱╭╮╱╭━━━╮
╱┃╭━╮┃╱┃╭━╮┃╱┃┃╰╯┃┃╱┃╭╮┃╱╱╰┫┣╯╱┃╭━╮┃╱┃╭━╮┃╱┃╭━╮┃╱┃╭━╮┃╱╱╱╱╱┃╭━╮┃╱┃╭━╮┃╱┃╭━━╯╱┃┃╰╮┃┃╱┃╭━╮┃
╱┃┃╱╰╯╱┃┃╱┃┃╱┃╭╮╭╮┃╱┃╰╯╰╮╱╱┃┃╱╱┃┃╱┃┃╱┃╰━╯┃╱┃╰━╯┃╱┃┃╱┃┃╱╱╱╱╱┃┃╱┃┃╱┃╰━╯┃╱┃╰━━╮╱┃╭╮╰╯┃╱┃┃╱┃┃
╱┃┃╭━╮╱┃╰━╯┃╱┃┃┃┃┃┃╱┃╭━╮┃╱╱┃┃╱╱┃╰━╯┃╱┃╭╮╭╯╱┃╭╮╭╯╱┃╰━╯┃╱╱╱╱╱┃╰━╯┃╱┃╭╮╭╯╱┃╭━━╯╱┃┃╰╮┃┃╱┃╰━╯┃
╱┃╰┻━┃╱┃╭━╮┃╱┃┃┃┃┃┃╱┃╰━╯┃╱╭┫┣╮╱┃╭━╮┃╱┃┃┃╰╮╱┃┃┃╰╮╱┃╭━╮┃╱╱╱╱╱┃╭━╮┃╱┃┃┃╰╮╱┃╰━━╮╱┃┃╱┃┃┃╱┃╭━╮┃
╱╰━━━╯╱╰╯╱╰╯╱╰╯╰╯╰╯╱╰━━━╯╱╰━━╯╱╰╯╱╰╯╱╰╯╰━╯╱╰╯╰━╯╱╰╯╱╰╯╱╱╱╱╱╰╯╱╰╯╱╰╯╰━╯╱╰━━━╯╱╰╯╱╰━╯╱╰╯╱╰╯
```

**[Versão em Português](README.md)**

LAN-based arena for creative competitions with locally-running LLMs on participants' computers.

## About the Club

The **Gambiarra LLM Club** is an in-person community inspired by the legendary Homebrew Computer Club, focused on creativity and ingenuity in using local LLMs. We hold monthly or bimonthly meetups where participants bring their own setups - often with limited hardware - and compete in live creative challenges.

**Values:**
- 🔧 **Gambiarra**: Creative and improvised solutions are celebrated
- 🎨 **Creativity**: We value originality over technical benchmarks
- 🤝 **Community**: In-person meetings for knowledge exchange
- 🏠 **Local-first**: All models run locally, without external API dependencies

**First meetup:** Recife, Brazil - January 2025

## Proposed Games

### 🤖 Bot vs Bot
Two LLMs debate a controversial topic in real-time.
- **Criteria:** Argumentative coherence, response creativity, refutation ability

### 🌐 Infinite Translation
Iterative translation through multiple languages.
- **Criteria:** Meaning preservation, fluency in each language, emergent humor

### 🧠 Knowledge with Tricks
Tricky questions that test reasoning and knowledge.
- **Criteria:** Factual accuracy, trick detection, explanation quality

### 📖 Story Continuation
Each LLM continues the previous one's story.
- **Criteria:** Narrative cohesion, originality, audience engagement

### 🎭 Hidden Character
Imitate celebrities or characters without revealing them explicitly.
- **Criteria:** Clue subtlety, characterological accuracy, discovery difficulty

### ⚡ Gambiarra Battle
Solve complex problems with creative solutions and hardware limitations.
- **Criteria:** Efficiency with limited resources, solution creativity, response speed

## Symbolic Trophies

- 🏆 **Golden GPU**: Best overall technical performance
- 🔧 **Supreme Gambiarra**: Most creative solution with limited hardware
- 💬 **Platinum Prompt**: Best prompt engineering
- ⚡ **Maximum Efficiency**: Best TPS (tokens per second)
- 🎭 **Actor of the Year**: Best characterization or roleplay
- 🧠 **Artificial IQ**: Best reasoning and coherence

## Technology Stack

**Why Node.js with TypeScript and Fastify?**

We chose this stack because it offers the best combination of WebSocket performance, end-to-end type safety, and development speed. Fastify is exceptional for real-time streaming with low latency, Prisma provides type-safety across the database layer, and the Node.js ecosystem facilitates quick participant onboarding - critical for our mission to make the platform accessible.

**Main stack:**
- Backend: Node.js 20+ with TypeScript, Fastify, Prisma ORM
- Alternative backend: Python 3.9+ with FastAPI, SQLAlchemy, Pydantic
- Frontend: React 18+ with Vite and Tailwind CSS
- Database: SQLite with Prisma migrations (Node) or Alembic (Python)
- WebSocket: @fastify/websocket for token streaming
- Validation: Zod for end-to-end schemas (Node) or Pydantic (Python)
- Package manager: pnpm for fast installation

### 🐍 Python Server Available!

In addition to the Node.js/TypeScript server, we offer a complete Python implementation using FastAPI:
- **Location:** `server-python/`
- **Features:** 100% compatible with clients (Python and TypeScript)
- **Documentation:** See [server-python/README.md](server-python/README.md)
- **Quick start:** See [server-python/QUICKSTART.md](server-python/QUICKSTART.md)
- **Stack:** FastAPI + SQLAlchemy 2.0 + Pydantic + aiosqlite

**Note:** The Python server uses an independent database schema. Choose one server (Node.js or Python) and use it consistently.

## Quick Start

### 🐳 Option 1: Docker (Recommended - Easiest!)

**Just one command to run everything:**

```bash
docker compose up
```

Done! 🎉 The complete application will be running at:
- **Server:** http://localhost:3000
- **Telão (Arena):** http://localhost:5173
- **Voting:** http://localhost:5173?view=voting
- **Scoreboard:** http://localhost:5173?view=scoreboard

**Prerequisites:**
- Docker and Docker Compose installed

**Useful commands:**
```bash
# Run in background
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down

# Rebuild after changes
docker compose up --build
```

### 💻 Option 2: Local Development

**🎯 First time?** Follow [PASSO_A_PASSO.md](PASSO_A_PASSO.md) - a complete guide from scratch! (Portuguese)

**⚡ Already know the project?** Use [QUICKSTART.md](QUICKSTART.md) - condensed version. (Portuguese)

**Prerequisites:**
- Node.js 20+
- pnpm 8+
- Ollama or LM Studio (optional, to use real LLMs)

**Installation:**

```bash
# Install dependencies
pnpm install

# Configure database (from root)
pnpm --filter @gambiarra/server db:migrate

# Seed with sample data (PIN: 123456)
pnpm --filter @gambiarra/server seed
```

**Development:**

```bash
# Start all services (server + telão)
pnpm dev
```

This will start:
- Server on port 3000 (http://localhost:3000)
- Telão on port 5173:
  - Arena: http://localhost:5173
  - Voting: http://localhost:5173?view=voting
  - Scoreboard: http://localhost:5173?view=scoreboard

### Running a Complete Session

**1. Create session (via API):**

```bash
curl -X POST http://localhost:3000/session | jq
# Returns: { "session_id": "...", "pin": "123456", ... }
```

**2. Create round:**

```bash
curl -X POST http://localhost:3000/rounds \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Write a poem in xote meter about AI",
    "maxTokens": 400,
    "temperature": 0.8,
    "deadlineMs": 90000
  }' | jq

# Returns the roundId
```

**3. Start round:**

```bash
curl -X POST http://localhost:3000/rounds/start \
  -H "Content-Type: application/json" \
  -d '{"roundId": "ROUND_ID_HERE"}' | jq
```

**4. Connect participants:**

Terminal 1 (TypeScript client with Ollama):
```bash
cd client-typescript
pnpm dev \
  --url ws://localhost:3000/ws \
  --pin 123456 \
  --participant-id ana-desktop \
  --nickname Ana \
  --runner ollama \
  --model llama3.1:8b
```

Terminal 2 (TypeScript client with mock):
```bash
cd client-typescript
pnpm dev \
  --url ws://localhost:3000/ws \
  --pin 123456 \
  --participant-id bruno-sim \
  --nickname Bruno \
  --runner mock
```

**5. Or use automatic simulation:**

```bash
# Connects 5 simulated clients automatically
pnpm simulate
```

**6. Watch on telão:**

Open http://localhost:5173 to see the live arena.

**7. Vote:**

Open http://localhost:5173?view=voting or scan the QR code on the telão.

**8. Export results:**

```bash
curl http://localhost:3000/export.csv > results.csv
```

## Project Structure

```
gambiarra-club-framework-chatgpt/
├── server/              # Fastify backend with WebSocket
│   ├── src/
│   │   ├── ws/          # WebSocket hub and schemas
│   │   ├── http/        # HTTP routes
│   │   ├── core/        # Business logic (rounds, votes, metrics)
│   │   └── db/          # Prisma schema and migrations
│   └── README.md
├── client-typescript/   # TypeScript CLI for participants
│   ├── src/
│   │   ├── runners/     # Ollama, LM Studio, Mock integrations
│   │   ├── net/         # WebSocket client
│   │   └── scripts/     # Simulation
│   └── README.md
├── telao/               # React frontend
│   └── src/
│       └── components/
└── docker-compose.yml
```

> **Note:** The Python client has been moved to a separate repository. For more information, check the README in the new repository.

## Creating New Challenges

Edit prompts when creating rounds via API POST `/rounds`:

```json
{
  "prompt": "Your creative challenge here",
  "maxTokens": 400,
  "temperature": 0.8,
  "deadlineMs": 90000,
  "seed": 1234
}
```

## Changing Scoring Weights

Current scoring is based on audience votes (1-5). To customize:

1. Edit `server/src/core/votes.ts` in the `getScoreboard()` function
2. Add new criteria (e.g., speed, efficiency)
3. Adjust the `total_score` formula

Example:
```typescript
return {
  // ... other fields
  total_score: (avgScore * 0.6) + (tpsAvg * 0.4) // 60% votes, 40% speed
};
```

## Tests

```bash
# Run all tests
pnpm test

# With coverage
pnpm test:coverage

# Load test (50 clients for 30s)
cd client
pnpm simulate
```

## Troubleshooting

**Ollama won't connect:**
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Start Ollama
ollama serve
```

**LM Studio won't connect:**
- Open LM Studio
- Go to "Local Server"
- Click "Start Server"
- Default port: 1234

**WebSocket disconnects:**
- Check firewall/antivirus
- Use `--url ws://LOCAL_NETWORK_IP:3000/ws` instead of localhost

## Contributing

1. Fork the repository
2. Create a branch for your feature (`git checkout -b feature/new-gambiarra`)
3. Commit your changes (`git commit -m 'Add new gambiarra'`)
4. Push to the branch (`git push origin feature/new-gambiarra`)
5. Open a Pull Request

## License

MIT

## Contact

- GitHub Issues: To report bugs or suggest features
- In-person meetups: Check our events calendar

---

**Made with ❤️ and lots of gambiarra by Gambiarra LLM Club**
