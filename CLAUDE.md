# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation

- **README.md** (Portuguese): Main user-facing documentation
- **README_EN.md** (English): English version of the README
- **CLAUDE.md** (This file): Developer documentation for Claude Code

## Project Overview

**Gambiarra LLM Club Arena Local** - A LAN-based arena for creative competitions using locally-run LLMs. Inspired by the Homebrew Computer Club, this platform celebrates creative solutions ("gambiarras") and community over pure performance benchmarks.

**Core Features:**
- Live challenges broadcast to participants
- Real-time token streaming from multiple LLM instances
- Public display (telão) showing generation progress
- Voting system for audience participation
- CSV export of results and metrics

## Technology Stack

- **Backend:** Node.js 20+ with TypeScript, Fastify, Prisma ORM, SQLite
- **Frontend:** React 18+ with Vite, Tailwind CSS
- **WebSocket:** @fastify/websocket for real-time streaming
- **Validation:** Zod schemas for type-safe messaging
- **Package Manager:** pnpm (monorepo with workspaces)

**Why this stack?** Fastify provides excellent WebSocket performance for low-latency streaming, Prisma ensures type-safety across the database layer, and pnpm enables fast installation crucial for participant onboarding.

## Architecture

### Monorepo Structure

```
├── server/              # Fastify backend with WebSocket hub
├── client-typescript/   # TypeScript CLI for participants to connect their LLMs
├── telao/               # React frontend for public display
```

> **Note:** The Python client has been moved to a separate repository.

### Key Components

**Server (`server/`):**
- `src/ws/hub.ts`: WebSocket connection manager, handles token streaming and broadcasts
- `src/core/rounds.ts`: Round lifecycle management (create, start, stop)
- `src/core/votes.ts`: Voting and scoreboard aggregation
- `src/http/routes.ts`: REST API for session/round control
- `prisma/schema.prisma`: Database schema (Session, Participant, Round, Metrics, Vote)

**Client TypeScript (`client-typescript/`):**
- `src/runners/ollama.ts`: Ollama API integration
- `src/runners/lmstudio.ts`: LM Studio API integration
- `src/runners/mock.ts`: Simulated token generation for testing
- `src/net/ws.ts`: WebSocket client with reconnection logic

**Telão (`telao/`):**
- `src/components/Arena.tsx`: Main display with participant grid (supports SVG rendering mode)
- `src/components/Voting.tsx`: Voting interface (accessible via QR code)
- URL views: `?view=voting` for voting, `?view=scoreboard` for scoreboard

## Common Development Commands

```bash
# Root
pnpm install          # Install all workspace dependencies
pnpm dev              # Start server + telao in dev mode
pnpm build            # Build all workspaces
pnpm simulate         # Run 5 simulated clients
pnpm test             # Run all tests

# Server
cd server
pnpm db:migrate       # Run database migrations
pnpm db:generate      # Generate Prisma Client
pnpm db:studio        # Open Prisma Studio GUI
pnpm seed             # Seed with test data (PIN: 123456)
pnpm dev              # Start server with hot reload
pnpm test:coverage    # Run tests with coverage

# Client TypeScript
cd client-typescript
pnpm dev -- --url ws://localhost:3000/ws --pin 123456 \
  --participant-id test-1 --nickname "Test" --runner mock

# Telão
cd telao
pnpm dev              # Start Vite dev server on port 5173
pnpm lint             # Run ESLint
```

## Database Schema

- **Session**: Contains `pinHash` (bcrypt), `status` (active/ended)
- **Participant**: Links to Session, stores `nickname`, `runner`, `model`
- **Round**: Contains `prompt`, `maxTokens`, `temperature`, `deadlineMs`, `seed`, `svgMode`
- **Metrics**: Stores `tokens`, `latencyFirstTokenMs`, `durationMs`, `tpsAvg`, `generatedContent` per participant/round
- **Vote**: Links voter (hashed) to participant with `score` (1-5)

## Message Protocols

All messages validated with Zod schemas in `server/src/ws/schemas.ts`.

**Server → Client:**
- `challenge`: Broadcast when round starts
- `heartbeat`: Periodic keepalive (30s interval)

**Client → Server:**
- `register`: Initial authentication with PIN
- `token`: Streaming tokens with sequential `seq` number
- `complete`: Final metrics after generation completes
- `error`: Client-side error reporting

**Telão → Server:**
- `telao_register`: Telão client registration (optional `view` field)
- `vote`: Submit vote with `voter_id`, `participant_id`, and `score` (1-5)

## Testing Strategy

- **Unit tests**: Schema validation (`server/src/ws/schemas.test.ts`), runner logic (`client-typescript/src/runners/mock.test.ts`)
- **Integration**: Simulation script connects 5 clients and validates token sequencing
- **Manual**: Use `pnpm seed` + `pnpm simulate` for end-to-end validation

**Running single tests:**
```bash
# Run specific test file
pnpm --filter @gambiarra/server test src/ws/schemas.test.ts

# Run tests matching pattern
pnpm --filter @gambiarra/server test -t "RegisterMessage"
```

## Configuration

Server config via environment variables (see `server/.env.example`):
- `PORT`, `HOST`: Server binding
- `DATABASE_URL`: SQLite file path
- `MDNS_HOSTNAME`: mDNS hostname for local network discovery
- `WS_COMPRESSION`: Disabled by default for LAN performance
- `RATE_LIMIT_MAX`: Requests per IP per time window

## Important Implementation Details

1. **Token Sequencing**: Tokens must arrive with sequential `seq` starting at 0. Server validates and drops duplicates.

2. **PIN Security**: PINs are hashed with bcrypt and never returned in GET endpoints.

3. **WebSocket Reconnection**: Client implements exponential backoff (max 5 attempts).

4. **Vote Privacy**: Voter IDs are SHA-256 hashed before storage.

5. **Scoreboard Calculation**: Currently `total_score = avgScore * voteCount`. Customize in `server/src/core/votes.ts:getScoreboard()`.

6. **SVG Mode**: Rounds can be created with `svgMode: true` to render participant outputs as SVG images in the telão.

## Adding New Features

**New Runner (TypeScript):**
1. Create `client-typescript/src/runners/newrunner.ts` implementing `Runner` interface
2. Add case in `client-typescript/src/cli.ts` switch statement
3. Add `--newrunner-url` option to CLI

**New Game Mode:**
1. Add prompt template in `README.md` under "Jogos Propostos"
2. Optionally add custom scoring logic in `server/src/core/votes.ts`

**Custom Metrics:**
1. Add column to `Metrics` model in `prisma/schema.prisma`
2. Run `pnpm db:migrate`
3. Update `CompleteMessage` schema and CSV export

## Deployment

### Development

```bash
pnpm dev  # Runs all workspaces in parallel
```

### Production with Docker (Recommended)

**Quick Start:**
```bash
docker compose up
```

The application will be available at:
- Server: http://localhost:3000
- Telão: http://localhost:5173 (nginx)
- Health check: http://localhost:3000/health

**Docker Setup Details:**

1. **Monorepo-aware build**: Dockerfiles handle pnpm workspace correctly
2. **Multi-stage builds**: Separate builder and production stages for optimization
3. **Prisma binary targets**: Configured for `linux-musl-arm64-openssl-3.0.x` (Alpine 3.22)
4. **Health checks**: Server has built-in health endpoint for container orchestration
5. **Volume persistence**: Server data is persisted in `server-data` volume

**Docker Commands:**
```bash
# Build and start in foreground
docker compose up --build

# Start in background (detached)
docker compose up -d

# View logs
docker compose logs -f

# View logs for specific service
docker compose logs -f server
docker compose logs -f telao

# Stop containers
docker compose down

# Stop and remove volumes
docker compose down -v

# Restart after code changes
docker compose up --build
```

**Architecture:**
- **Server Container**: Node.js 20 Alpine with Fastify, SQLite, Prisma
- **Telão Container**: nginx Alpine serving static React build
- **Network**: Both containers on `gambiarra-net` bridge network
- **Health Check**: Server monitored via `wget` on `/health` endpoint
- **Startup**: Telão waits for server to be healthy before starting

**Environment Variables:**
Configure via `docker-compose.yml`:
- `DATABASE_URL`: SQLite path (default: `/monorepo/server/data/production.db`)
- `CORS_ORIGIN`: CORS configuration (default: `*`)
- `PORT`: Server port (default: `3000`)
- `HOST`: Server host (default: `0.0.0.0`)

**Troubleshooting:**
- If build fails, check Docker logs: `docker compose logs`
- Prisma issues: Ensure `binaryTargets` in `schema.prisma` matches your architecture
- Permission issues: Check volume mounts in `docker-compose.yml`
- Container won't start: Check healthcheck logs with `docker inspect`

## Quick Start for New Session

```bash
# 1. Create session and note PIN
curl -X POST http://localhost:3000/session | jq '.pin'

# 2. Seed with test round
pnpm --filter server seed

# 3. Start round (get roundId from seed output or /session)
curl -X POST http://localhost:3000/rounds/start \
  -H "Content-Type: application/json" \
  -d '{"roundId": "ROUND_ID"}'

# 4. Connect clients (use PIN from step 1)
pnpm simulate
```
