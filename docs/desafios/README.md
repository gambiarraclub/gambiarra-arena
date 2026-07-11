# Criando novos desafios na Gambiarra Arena

> **Para quem é este guia:** um agente de código (ou pessoa) que vai implementar
> um novo tipo de desafio. Ele foi escrito para ser seguido passo a passo, com
> âncoras de busca e checkpoints verificáveis — não é preciso conhecer o
> repositório de antemão.

## Como usar este guia

1. Leia **este arquivo inteiro** (é curto). Ele explica a arquitetura e decide
   qual receita seguir.
2. Abra **apenas a receita indicada** e siga os passos NA ORDEM, executando o
   checkpoint de cada passo antes de ir ao próximo.
3. Nunca pule um checkpoint que falhou. Se falhou, releia o passo.

| Receita | Quando usar | Esforço |
|---|---|---|
| [RECEITA-A](RECEITA-A-novo-modo-de-renderizacao.md) | O desafio muda **como a resposta aparece** (telão/votação/placar), mas a dinâmica é a mesma: prompt → geração → votação | ~12 passos, 1 sessão |
| [RECEITA-B](RECEITA-B-novo-modo-de-interacao.md) | O desafio muda **a dinâmica de interação** (loop contínuo, mundo compartilhado, mensagens novas) | Grande — um subsistema |

Se o desafio só muda **regras/pontuação** (ex.: pontuar por velocidade), não é
um modo novo: ajuste `getScoreboard()` em `server/src/core/votes.ts` e pare aí.

---

## Os desafios que já existem (e o que ensinam)

### 1. Modo texto (o pipeline base)

O admin cria uma rodada com um prompt. O servidor faz broadcast do desafio por
WebSocket para todos os participantes; cada LLM local gera tokens que são
transmitidos de volta um a um e replicados ao telão em tempo real. Ao final,
abre-se a votação nos celulares e a cerimônia de revelação no placar.

```
AdminPanel ──POST /rounds──▶ RoundManager.createRound
AdminPanel ──POST /rounds/start──▶ broadcast {type:'challenge'} ──▶ clientes (CLI e /client)
cliente ──{type:'token', seq}──▶ hub ──token_update──▶ telão (Arena)
cliente ──{type:'complete'}──▶ hub ──▶ Metrics (com generatedContent)
AdminPanel ──POST /rounds/stop──▶ votingStatus='open' ──round_state──▶ celulares (Voting)
```

### 2. Modo SVG (`svgMode`) — **o gabarito da Receita A**

É o MESMO pipeline acima com uma flag booleana na rodada. Tudo que a flag faz é
trocar o RENDERIZADOR da resposta em quatro telas:

- `telao/src/components/ParticipantCard.tsx` — card no telão (via `SvgRenderer`)
- `telao/src/components/Voting.tsx` — celular do votante
- `telao/src/components/Scoreboard.tsx` — cerimônia de revelação
- `client-browser/client.html` — preview local do participante

O cliente participante **não recebe a flag**: a mensagem `challenge` não carrega
o modo. Quem sabe do modo são o telão/votação/placar (que leem a rodada) e o
preview do `/client` (que detecta `<svg` no próprio texto gerado).

### 3. Modo World (`/agent` + `/world`) — **o gabarito da Receita B**

Dinâmica completamente diferente: um mundo 2D contínuo onde cada participante
controla uma criatura. Tem mensagens WS próprias (`world_join`, `agent_action`,
`perception`, `world_state`), um motor de simulação (`server/src/core/world.ts`,
20 Hz), uma view própria no telão (`WorldArena`), um painel de controle
(`WorldControl`), um cliente próprio (`client-browser/agent.html`) e eventos
próprios no event log (incluindo `world_snapshot` a cada 5 s com o estado
completo — mantenha isso em qualquer modo novo dessa família!).

---

## Mapa do repositório (o que mora onde)

| Arquivo | Papel | Mexe na Receita |
|---|---|---|
| `server/prisma/schema.prisma` | Modelo do banco (Round, Metrics, …) | A |
| `server/src/http/routes.ts` | REST: criar/iniciar/parar rodada, votos, respostas | A e B |
| `server/src/core/rounds.ts` | Ciclo de vida da rodada + broadcasts `round_state` | A |
| `server/src/core/votes.ts` | Votação, respostas para a votação, placar | A |
| `server/src/ws/schemas.ts` | **Contrato Zod de TODAS as mensagens WS** | B (A não mexe) |
| `server/src/ws/hub.ts` | Roteia mensagens WS; snapshot ao registrar telão | B (A não mexe) |
| `server/src/core/world.ts` | Motor do World (gabarito de engine da Receita B) | B |
| `server/src/core/eventlog.ts` | União `EventType` — todo evento novo entra aqui | B |
| `telao/src/App.tsx` | Roteamento por caminho (`/voting`, `/world`, …) | B |
| `telao/src/components/AdminPanel.tsx` | Formulário de criação de rodada | A |
| `telao/src/components/Arena.tsx` | Telão principal (grid de participantes) | A |
| `telao/src/components/ParticipantCard.tsx` | Card de um participante no telão | A |
| `telao/src/components/Voting.tsx` | Votação no celular | A |
| `telao/src/components/Scoreboard.tsx` | Placar/cerimônia | A |
| `telao/src/hooks/useTelaoSocket.ts` | WS com reconexão (telão/votação) | reutilizar |
| `client-browser/client.html` | Cliente navegador do modo desafio | A (opcional) |
| `client-browser/agent.html` | Cliente navegador do modo World | B |
| `client-browser/shared/*.js` | Módulos compartilhados dos dois clientes | reutilizar |

---

## Regras de ouro (valem para as duas receitas)

1. **Copie um padrão existente; não invente estrutura nova.** Na Receita A o
   padrão é `svgMode` (procure a palavra em cada arquivo e replique cada
   ocorrência). Na Receita B o padrão é o World.
2. **Nunca renomeie nem remova campos existentes.** Só adicione.
3. **Não toque** na validação de `seq` dos tokens (`hub.ts`), na lógica de
   reconexão, nem em `server/dist/` (é gerado).
4. Toda mensagem WS nova **precisa de schema Zod** em `server/src/ws/schemas.ts`
   e de um case no `switch` de `handleMessage` no `hub.ts`.
5. Todo tipo de evento novo do event log entra na união `EventType` em
   `server/src/core/eventlog.ts` (senão o TypeScript quebra — de propósito).
6. Textos de interface em **português brasileiro**, no tom do que já existe.
7. Estado para telão/votação viaja por **push WS** (`round_state`,
   `state_snapshot`); polling é só fallback. Não adicione polls novos.
8. Depois de QUALQUER mudança no servidor: `pnpm --filter @gambiarra/server build`
   precisa passar. No telão: `pnpm --filter telao build`. Não siga adiante com
   build quebrado.

## Validação final (qualquer receita)

```bash
# 1. builds
pnpm --filter @gambiarra/server build && pnpm --filter telao build

# 2. testes existentes continuam passando
pnpm --filter @gambiarra/server exec vitest run

# 3. sobe com banco descartável (NUNCA teste no dev.db histórico)
cd server && DATABASE_URL="file:/tmp/desafio-teste.db" npx prisma migrate deploy \
  && DATABASE_URL="file:/tmp/desafio-teste.db" node dist/index.js &

# 4. fumaça: sessão + rodada do novo modo + clientes mock
curl -s -X POST localhost:3000/session -H 'content-type: application/json' -d '{}'
# (use o PIN retornado com `pnpm simulate` ou um cliente mock; crie a rodada
#  com a flag nova e verifique telão, votação e placar no navegador)
```

O critério de pronto: **os três modos antigos continuam funcionando** e o novo
modo aparece corretamente nas quatro telas (telão, votação, placar, preview).
