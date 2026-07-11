# COMO RODAR — Gambiarra Arena

> Guia operacional. Se está com pressa no dia do encontro, vá direto para
> [Modo Evento](#modo-evento-o-jeito-certo-no-dia-do-encontro).

## Primeira vez na máquina

```bash
# pré-requisitos: Node 20+, pnpm
pnpm install
cp server/.env.example server/.env   # se ainda não existir
pnpm --filter @gambiarra/server db:migrate
```

---

## Modo desenvolvimento (dia a dia)

```bash
pnpm dev
```

Sobe **servidor** (`:3000`, com `tsx watch` — reinicia ao salvar arquivo) e
**telão** (`:5173`, Vite) em paralelo. Bom para desenvolver, **ruim para
evento**: salvar um arquivo derruba os WebSockets de todo mundo.

---

## Modo Evento (o jeito certo no dia do encontro)

```bash
pnpm event
```

O script `scripts/event.sh` faz, nesta ordem:

1. aumenta o limite de file descriptors (tempestade de reconexões);
2. instala dependências se faltarem e cria `server/.env` se não existir;
3. **faz backup do banco atual** em `server/data/backups/` antes de tocar nele;
4. prepara o banco (prisma generate + db push);
5. **builda o servidor** e roda `node dist/index.js` — sem watch, nada
   reinicia sozinho;
6. sobe o telão (Vite) e imprime o **IP da máquina na LAN**.

`Ctrl+C` encerra os dois.

> 💡 **Banco novo por encontro (recomendado):** o banco padrão
> (`server/prisma/dev.db`) acumula histórico. Para começar o evento zerado sem
> apagar nada, rode com um banco dedicado ANTES do `pnpm event`, editando o
> `server/.env`:
> `DATABASE_URL="file:./data/encontro-AAAA-MM-DD.db"` — e pronto: o histórico
> fica intacto e o post-mortem do dia nasce em arquivo próprio.

### Roteiro operacional do encontro (tudo pelo navegador — zero terminal)

Depois do `pnpm event`, **toda a condução acontece em duas abas**: o painel
**`/admin`** (sessão + rodadas + votação + revelação) e, se for jogar o modo
World, o painel **`/control`**. Nada de curl com plateia olhando.

**1. Abrir o painel de administração** → `http://localhost:5173/admin`

- Clique em **"Nova Sessão"** — o **PIN aparece na tela** (deixe essa aba
  aberta; o PIN fica sempre visível no card "Sessão Ativa").
- ⚠️ "Nova Sessão" desconecta todos os participantes da sessão anterior — é o
  botão de "começar o encontro", não aperte no meio do jogo.

**2. Compartilhar com os participantes** (troque `<IP>` pelo IP que o
`pnpm event` imprime; as duas portas funcionam para as páginas de participante):

| Quem | URL |
|---|---|
| Participante — modo desafio (texto/SVG) | `http://<IP>:3000/client` |
| Participante — modo world (agentes) | `http://<IP>:3000/agent` |
| Plateia — votação (QR aparece no telão) | `http://<IP>:5173/voting` |

**3. Telas do apresentador** (projetor/notebook):

| Tela | URL |
|---|---|
| 🖥️ Telão principal (grid de gerações) | `http://<IP>:5173/` |
| 🌍 Telão do World | `http://<IP>:5173/world` |
| 🎛️ **Admin — o cockpit do evento** | `http://<IP>:5173/admin` |
| 🕹️ Controle do World | `http://<IP>:5173/control` |
| 🏆 Placar / cerimônia | `http://<IP>:5173/scoreboard` |

**4. Conduzir uma rodada — só cliques, no `/admin`** (nomes exatos dos botões):

1. Em **"Criar Nova Rodada"**: preencha o prompt (há templates prontos; marque
   *SVG Mode* se for desafio visual) → **"Criar Rodada"**;
2. **"▶️ Iniciar Rodada"** — o desafio dispara para todos na hora;
3. **"⏹️ Parar Rodada"** — encerra a geração e **já abre a votação** nos
   celulares (o status vira **"🗳️ Votação Aberta"**);
4. **"🏆 Iniciar Premiação"** quando a plateia terminar de votar;
5. **"Revelar Próximo"** — vá clicando com o `/scoreboard` no projetor
   (revela do último para o primeiro lugar, com suspense).

**5. Modo World — no `/control`:**

- Defina o objetivo ("O que os agentes devem fazer?") e a quantidade de
  **comidas** → **"▶️ Iniciar partida"**. Para encerrar: **"⏹️ Parar"**
  (grava o placar final no event log).
- Nota histórica: em 23/05 ninguém apertou o iniciar e o mundo passou a manhã
  sem comida 😄. Hoje o mundo auto-inicia quando o 1º agente entra, mas o
  `/control` continua sendo o lugar de definir objetivo/comidas e de encerrar.

### Depois do encontro (ritual de preservação)

**Exports (pelo navegador):** no fim da página do `/admin`, seção
**"📊 Exportar Dados para Pesquisa"** — três botões de download:
`export.csv` (métricas), `export-events.csv` (linha do tempo de eventos) e
`export-all.json` (tudo: sessão, rodadas, métricas, votos, eventos).

> 📖 O ritual completo (backup → análise → relatório HTML) está documentado
> passo a passo em `docs/reports/README.md` — escrito para um agente de
> código executar.

**Backup dos dados brutos** (esse é no terminal, mas sem plateia — NÃO pule):

```bash
DEST=~/Dropbox/BACKUPS/GAMBIARRA_ARENA/backup-$(date +%Y%m%d-%H%M%S)
mkdir -p "$DEST" && cp -R server/prisma/*.db server/logs server/data "$DEST"/
```

Os dados de cada dia ficam em: `server/logs/server-AAAA-MM-DD.log` (log
estruturado), `server/data/snapshots/` (snapshots automáticos de sessão) e no
banco (`event_logs` inclui `world_snapshot` a cada 5 s — o World inteiro é
reconstruível frame a frame).

---

## Docker (alternativa de produção)

```bash
pnpm docker:up      # = docker compose up --build
# servidor: :3000 · telão (nginx): :5173 · dados no volume server-data
pnpm docker:down
```

---

## Utilitários

```bash
pnpm simulate   # 5 clientes mock (precisa de sessão criada; PIN do seed: 123456)
pnpm seed       # sessão de teste com PIN 123456 + rodada de exemplo
pnpm test       # testes de todos os workspaces
pnpm build      # build de todos os workspaces
```

---

## Pegadinhas conhecidas (aprendidas em campo)

| Sintoma | Causa e solução |
|---|---|
| `localhost:3000` não abre no Chrome, mas `curl` funciona | O servidor escuta só IPv4 e o Chrome resolve `localhost` para IPv6. Use `127.0.0.1:3000` ou o IP da LAN. |
| Participante: dropdown de modelos vazio / "Failed to fetch" | CORS do LLM local. O botão ⟳ do `/client` mostra o comando certo por plataforma (Windows: `$env:OLLAMA_ORIGINS="*"; ollama serve`). Digitar o modelo à mão sempre funciona. |
| Participante digitou a URL do LLM sem `http://` | O cliente normaliza sozinho desde 07/2026 — mas se ver 404 estranho no servidor (`GET /127.0.0.1:.../v1/models`), é um cliente antigo em cache: peça um hard refresh. |
| World no telão sem comida e placar zerado | Ninguém iniciou a partida: painel `/control` → "▶️ Iniciar partida" (versões atuais auto-iniciam no 1º join). |
| Página do participante com cara de versão antiga | As páginas `/client`, `/agent` e assets são servidas com `Cache-Control: no-store` — um reload resolve. Se não resolver, hard refresh (`Ctrl+Shift+R` / `Cmd+Shift+R`). |
| 429 / rate limit em massa | Não deve mais acontecer (estado vai por WebSocket e localhost é isento), mas se acontecer: verifique `RATE_LIMIT_MAX` no `server/.env` e leia `LIMITS.md`. |
| Servidor reiniciando sozinho durante o evento | Você subiu com `pnpm dev` (watch). Use `pnpm event`. |
| `GET /api/session 404` no console ao abrir `/admin`, `/control` ou `/world` | Não é erro: significa apenas que **ainda não há sessão ativa** (normal com banco novo). Clique em "Nova Sessão" e o 404 some. |
| Telão/rotas em branco com `504 (Outdated Optimize Dep)` no console | Duas instâncias do Vite disputando o cache (porta 5173 já estava ocupada por um processo antigo e o novo foi para 5174). Solução: `lsof -ti :3000 -ti :5173 -ti :5174 \| xargs kill`, `rm -rf telao/node_modules/.vite`, e rode `pnpm event` de novo. |
| **Nunca** teste em cima do banco de um encontro passado | Use `DATABASE_URL="file:/tmp/teste.db"` + `npx prisma migrate deploy` para experimentos. Os bancos históricos têm backup em `~/Dropbox/BACKUPS/GAMBIARRA_ARENA/`. |

## Plano B — os mesmos comandos via curl

Só para emergências (painel inacessível) ou automação. No dia do evento,
prefira SEMPRE o `/admin` e o `/control`.

```bash
# sessão nova (o PIN vem na resposta)
curl -s -X POST http://localhost:3000/session -H 'content-type: application/json' -d '{}'

# rodada: criar → iniciar → parar (abre votação) → encerrar votação → revelar
curl -s -X POST http://localhost:3000/rounds -H 'content-type: application/json' \
  -d '{"prompt":"...","maxTokens":1000,"svgMode":false}'
curl -s -X POST http://localhost:3000/rounds/start -H 'content-type: application/json' -d '{"roundId":"<ID>"}'
curl -s -X POST http://localhost:3000/rounds/stop  -H 'content-type: application/json' -d '{"roundId":"<ID>"}'
curl -s -X POST http://localhost:3000/rounds/<ID>/close-voting
curl -s -X POST http://localhost:3000/rounds/<ID>/reveal
curl -s -X POST http://localhost:3000/rounds/<ID>/reveal-next   # repita por posição

# world
curl -s -X POST http://localhost:3000/world/start -H 'content-type: application/json' -d '{"foodCount":14}'
curl -s -X POST http://localhost:3000/world/stop

# exports
curl -s http://localhost:3000/export-all.json -o encontro-completo.json
curl -s http://localhost:3000/export.csv -o metricas.csv
curl -s http://localhost:3000/export-events.csv -o eventos.csv
```

## Documentos irmãos

- `QUICKSTART.md` / `PASSO_A_PASSO.md` — onboarding de participante
- `docs/desafios/README.md` — como criar um novo tipo de desafio
- `LIMITS.md` — limites de conexão e rate limiting
- `ARCHITECTURE.md` — visão geral dos componentes
