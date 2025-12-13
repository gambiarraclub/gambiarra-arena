# Arquitetura do Sistema - Gambiarra Arena

Este documento descreve a arquitetura do sistema para uso em geradores de diagramas.

## Componentes Principais

### 1. Servidor Central (Fastify + SQLite)
- **WebSocket Hub**: gerencia conexões em tempo real
- **API REST**: controle de sessões e rounds
- **Banco de dados SQLite**: sessões, participantes, métricas, votos

### 2. Clientes Participantes (N computadores)
- CLI TypeScript rodando localmente
- LLM local (Ollama, LM Studio ou outro)
- Conectam via WebSocket ao servidor

### 3. Telão (Frontend React)
- **Arena**: exibe geração de tokens em tempo real
- **Admin Panel**: controle da sessão
- **Voting**: interface de votação
- **Scoreboard**: placar de resultados

### 4. Plateia (N dispositivos móveis/browsers)
- Acessam via QR Code ou URL
- Votam nas respostas (escala 0-5)
- Não precisam de LLM

---

## Diagrama ASCII

```
┌─────────────────────────────────────────────────────────────────┐
│                    REDE LOCAL (LAN)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐                                              │
│  │   ADMIN      │                                              │
│  │  (Browser)   │──────HTTP────┐                               │
│  └──────────────┘              │                               │
│                                ▼                               │
│  ┌──────────────┐      ┌──────────────────┐                   │
│  │  TELÃO       │      │  SERVIDOR        │                   │
│  │  (Projetor)  │◄─WS──│  CENTRAL         │                   │
│  │              │      │                  │                   │
│  │  - Arena     │      │  - WebSocket Hub │                   │
│  │  - Scoreboard│      │  - REST API      │                   │
│  └──────────────┘      │  - SQLite DB     │                   │
│                        └────────┬─────────┘                   │
│                                 │                              │
│              ┌──────────────────┼──────────────────┐          │
│              │                  │                  │          │
│              ▼                  ▼                  ▼          │
│       ┌──────────┐       ┌──────────┐       ┌──────────┐     │
│       │CLIENTE 1 │       │CLIENTE 2 │       │CLIENTE N │     │
│       │          │       │          │       │          │     │
│       │ CLI +    │       │ CLI +    │       │ CLI +    │     │
│       │ Ollama   │       │ LM Studio│       │ LLM      │     │
│       └────┬─────┘       └────┬─────┘       └────┬─────┘     │
│            │WS                │WS                │WS         │
│            └──────────────────┴──────────────────┘           │
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐│
│  │                 PLATEIA                                   ││
│  │                                                           ││
│  │   📱        📱        📱        💻        📱             ││
│  │  Voter 1   Voter 2   Voter 3   Voter 4   Voter N        ││
│  │                                                           ││
│  │           (Acessam /voting via QR Code)                  ││
│  │                   HTTP POST /votes                        ││
│  └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Diagrama Simplificado

```
             ┌─────────────┐
             │   ADMIN     │
             │  (Browser)  │
             └──────┬──────┘
                    │ HTTP
                    ▼
┌─────────┐   ┌──────────┐   ┌─────────┐
│ CLIENTES│   │ SERVIDOR │   │ PLATEIA │
│  (LLMs) │◄─►│ CENTRAL  │◄──│ (Voters)│
│         │WS │          │HTTP│         │
└─────────┘   └────┬─────┘   └─────────┘
                   │ WS
                   ▼
             ┌──────────┐
             │  TELÃO   │
             │(Projetor)│
             └──────────┘
```

---

## Prompt para Gerador de Diagramas

> Diagrama de arquitetura de sistema para competição de LLMs em rede local.
>
> **Componente central:** Servidor Node.js/Fastify com banco SQLite. Possui dois serviços: WebSocket Hub (porta 3000/ws) e REST API (porta 3000).
>
> **Grupo 1 - Clientes Participantes (lado esquerdo):**
> Múltiplos computadores (3-5 ícones de laptop), cada um com CLI TypeScript e LLM local (Ollama/LM Studio). Conectam ao servidor via WebSocket bidirecional. Setas bidirecionais com labels: "register", "challenge", "token stream", "complete".
>
> **Grupo 2 - Displays (topo):**
> - Telão/Projetor: recebe atualizações em tempo real via WebSocket (token_update, completion)
> - Admin Panel: browser com controle HTTP (criar sessão, iniciar/parar rounds)
>
> **Grupo 3 - Plateia (lado direito):**
> Múltiplos dispositivos móveis (5-8 ícones de smartphone). Acessam página de votação via HTTP. Seta unidirecional: "POST /votes (score 0-5)".
>
> **Fluxo de dados:**
> 1. Admin cria sessão e round
> 2. Server envia "challenge" aos clientes via WebSocket
> 3. Clientes geram tokens com LLM local e enviam "token" sequenciais
> 4. Server transmite tokens em tempo real para Telão
> 5. Admin encerra round, abre votação
> 6. Plateia vota nas respostas
> 7. Scoreboard exibe resultados
>
> **Cores sugeridas:**
> - Servidor: azul
> - Clientes/LLMs: verde
> - Plateia: laranja
> - Admin/Telão: roxo

---

## Fluxos de Comunicação

| Elemento | Protocolo | Direção | Descrição |
|----------|-----------|---------|-----------|
| Cliente → Servidor | WebSocket | Bidirecional | Registro, streaming de tokens, métricas |
| Servidor → Telão | WebSocket | Server→Client | Atualizações em tempo real |
| Admin → Servidor | HTTP | Request/Response | Controle de sessão e rounds |
| Plateia → Servidor | HTTP | Request/Response | Votação (POST /votes) |

---

## Mensagens WebSocket

### Server → Cliente
- `challenge`: broadcast quando round inicia
- `heartbeat`: keepalive periódico (30s)

### Cliente → Server
- `register`: autenticação inicial com PIN
- `token`: streaming de tokens com número sequencial `seq`
- `complete`: métricas finais após geração
- `error`: relatório de erros do cliente

### Telão → Server
- `telao_register`: registro do cliente telão

### Server → Telão
- `token_update`: atualização de tokens em tempo real
- `completion`: geração finalizada
- `participant_registered`: novo participante conectado
- `participant_disconnected`: participante desconectado

---

## Ciclo de Vida de um Round

```
┌─────────────────────────────────────────────────────────────┐
│                    FASE DE SETUP                            │
├─────────────────────────────────────────────────────────────┤
│ 1. Admin cria sessão (POST /session) → gera PIN            │
│ 2. Participantes conectam via WebSocket com PIN            │
│ 3. Admin cria round com prompt (POST /rounds)              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    FASE DE GERAÇÃO                          │
├─────────────────────────────────────────────────────────────┤
│ 1. Admin inicia round (POST /rounds/start)                 │
│ 2. Server broadcast "challenge" para todos clientes        │
│ 3. Clientes executam LLM local                             │
│ 4. Tokens enviados em sequência (seq: 0, 1, 2...)         │
│ 5. Server retransmite para Telão em tempo real            │
│ 6. Cliente envia "complete" com métricas                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    FASE DE VOTAÇÃO                          │
├─────────────────────────────────────────────────────────────┤
│ 1. Admin para round (POST /rounds/stop) → abre votação     │
│ 2. Plateia acessa /voting via QR Code                      │
│ 3. Respostas exibidas em ordem aleatória                   │
│ 4. Votos de 0-5 para cada resposta                         │
│ 5. Admin fecha votação (POST /rounds/:id/close-voting)     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    FASE DE REVELAÇÃO                        │
├─────────────────────────────────────────────────────────────┤
│ 1. Admin inicia reveal (POST /rounds/:id/reveal)           │
│ 2. Scoreboard exibe posições progressivamente              │
│ 3. Admin revela próxima posição (POST /rounds/:id/reveal-next) │
│ 4. Medalhas: 🥇 🥈 🥉                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Tecnologias Utilizadas

| Componente | Tecnologia |
|------------|------------|
| Servidor | Node.js 20+, Fastify, TypeScript |
| Banco de Dados | SQLite + Prisma ORM |
| WebSocket | @fastify/websocket |
| Frontend | React 18+, Vite, Tailwind CSS |
| Validação | Zod schemas |
| Package Manager | pnpm (monorepo) |
| Cliente LLM | TypeScript CLI |
| Runners | Ollama, LM Studio, Mock |

---

## Portas e Endpoints

| Serviço | Porta | Endpoint |
|---------|-------|----------|
| Servidor HTTP | 3000 | `/session`, `/rounds`, `/votes`, `/scoreboard` |
| Servidor WebSocket | 3000 | `/ws` |
| Telão (dev) | 5173 | `/`, `/voting`, `/scoreboard`, `/admin` |
