# RECEITA B — Novo modo de interação (padrão World)

> **O que você vai fazer:** um desafio com dinâmica própria — loop contínuo,
> estado compartilhado, mensagens novas — como o Mundo de Agentes. É um
> subsistema: espere tocar ~8 arquivos e criar 2–3 novos.
>
> **Gabarito:** o modo World. Em CADA etapa, abra o arquivo correspondente do
> World e espelhe a estrutura. Não invente arquitetura nova.
>
> **Antes de codar:** escreva numa nota o CONTRATO do seu modo no formato da
> Etapa 1. Se não conseguir preencher o contrato, o design não está pronto.

---

## Etapa 1 — Contrato de mensagens (papel antes de código)

Preencha (exemplo entre parênteses = como o World respondeu):

1. Como o participante ENTRA no modo? (World: msg `world_join {emoji}` após o
   `register` normal)
2. O que o servidor envia ao participante e quando? (World: `perception` com
   radar textual, a cada pulso)
3. O que o participante responde? (World: `agent_action {direction, say, pulse}`)
4. O que o telão precisa receber para desenhar? (World: `world_state` a 20 Hz
   com agentes + comidas)
5. Como o modo inicia/para? (World: `POST /world/start|stop` pelo painel
   `/control`)
6. O que precisa ficar gravado para reconstruir depois? (World: eventos
   `world_started/joined/stopped` + **`world_snapshot` a cada 5 s com o estado
   completo** — obrigatório no seu modo também; em 23/05 perdemos as posições
   por não ter isso)

## Etapa 2 — Schemas Zod das mensagens

**Arquivo:** `server/src/ws/schemas.ts`
**Espelhe:** `WorldJoinMessageSchema` e `AgentActionMessageSchema` (cliente →
servidor), e o shape de `world_state`/`perception` (servidor → cliente).

- Toda mensagem cliente→servidor nova entra TAMBÉM na união
  `ExtendedClientMessageSchema` (procure por ela no mesmo arquivo).
- Exporte os tipos `z.infer` como os existentes.

**Checkpoint:** `pnpm --filter @gambiarra/server build`.

## Etapa 3 — O motor (engine)

**Crie:** `server/src/core/<seumodo>.ts`
**Espelhe:** `server/src/core/world.ts`, mantendo a MESMA anatomia:

- interface `XxxHub` mínima no topo (evita import circular com o hub)
- `DEFAULT_CONFIG` como constante
- classe com: `start(params)`, `stop()`, `isRunning()`, `ensureLoop()`,
  `tick()` privado com `SIM_INTERVAL_MS`, `handleJoin(...)`, `handleAction(...)`,
  `removeAgent(participantId)`, `snapshot()`, `buildState()` privado,
  `broadcast()` via `hub.broadcastToTelao(...)`
- **snapshots periódicos**: espelhe `maybeLogSnapshot` + a constante
  `WORLD_SNAPSHOT_INTERVAL_MS` do world.ts (chame no fim do `tick()`)
- logs com prefixo caixa-alta (`MEUMODO_START: ...`) como o World faz

## Etapa 4 — Event log

**Arquivo:** `server/src/core/eventlog.ts`
**Procure:** `| 'world_snapshot';`
**Faça:** adicione os tipos do seu modo à união `EventType`
(`| 'meumodo_started' | 'meumodo_joined' | 'meumodo_stopped' | 'meumodo_snapshot'`).
O build TypeScript falha se você usar um tipo não declarado — é proposital.

## Etapa 5 — Roteamento WS no hub

**Arquivo:** `server/src/ws/hub.ts`

1. **Procure** `export interface WorldEngineLike` → declare uma interface
   análoga para o seu engine e um `setXxxEngine(...)` como `setWorldEngine`.
2. **Procure** o `switch (message.type)` em `handleMessage` → adicione um
   `case` por mensagem nova, espelhando `case 'world_join'` /
   `case 'agent_action'` (métodos privados `handleXxxJoin`/`handleXxxAction`
   que exigem conexão registrada antes).
3. **Procure** `this.worldEngine?.removeAgent(conn.participantId);` em
   `handleDisconnection` → adicione a limpeza equivalente do seu engine.

**NÃO toque** em: validação de `seq`, dedup de conexões, ping/pong,
`buildStateSnapshot`.

## Etapa 6 — Instanciar e rotear no servidor

**Arquivo:** `server/src/index.ts`
**Procure:** `const worldEngine = new WorldEngine(hub, app.log, eventLogger);`
→ instancie o seu engine ao lado, chame `hub.setXxxEngine(...)`, e adicione a
limpeza em `cleanup` (procure `worldEngine.cleanup` ou o bloco de shutdown).

**Arquivo:** `server/src/http/routes.ts`
**Procure:** `app.post('/world/start'` → espelhe as três rotas
(`/seumodo/start`, `/seumodo/stop`, `/seumodo/state`), incluindo a busca da
sessão ativa para `sessionId` (é o que liga os eventos ao event log).

**Checkpoint:** build do servidor + `vitest run` passam.

## Etapa 7 — View do telão

**Crie:** `telao/src/components/XxxArena.tsx`
**Espelhe:** `telao/src/components/WorldArena.tsx` — WS que registra com
`{type:'telao_register', view:'<seumodo>'}`, estado interpolado entre
snapshots, canvas com raf, overlays (título/placar), banner de desconexão.

**Arquivo:** `telao/src/App.tsx`
**Procure:** `if (path === '/world') return 'world';` → adicione a rota, o
título em `PAGE_TITLES`, o `case` no `renderView()` e o import. Se houver
painel de controle, espelhe também `WorldControl` + rota `/control`.

**Checkpoint:** `pnpm --filter telao build`.

## Etapa 8 — Cliente do participante

**Crie:** `client-browser/<seumodo>.html`
**Espelhe:** `client-browser/agent.html`. REUTILIZE os módulos de
`/client-assets/` (ui, net, runners, models, connection) — o seu HTML deve
conter apenas layout + a lógica específica do modo (prompt building, parsing
da resposta do LLM, envio da ação). Registre a rota da página:

**Arquivo:** `server/src/index.ts`
**Procure:** `app.get('/agent', { config: { rateLimit: false } }, serveBrowserClient('agent.html'));`
→ adicione a linha do seu HTML.

⚠️ Parsing de resposta de LLM pequeno: espelhe `parseDecision` do
`agent.html` — seja TOLERANTE (regex em camadas, fallback explícito), nunca
espere JSON limpo.

## Etapa 9 — Validação

```bash
pnpm --filter @gambiarra/server build && pnpm --filter telao build
pnpm --filter @gambiarra/server exec vitest run
# banco descartável + fluxo completo:
# sessão → registrar participante mock → join do modo → start → telão em
# /<seumodo> desenhando → ações refletidas → stop → eventos no event_logs
```

**Critérios de aceite:**

- [ ] Participante entra, age e sai sem afetar os modos existentes
- [ ] Telão desenha o estado e sobrevive a reconexão (feche/reabra a aba)
- [ ] `event_logs` contém `<seumodo>_started/joined/stopped` **e os snapshots
      periódicos com estado completo**
- [ ] Restart do servidor no meio não deixa o telão em tela de erro
      (deve mostrar reconectando e voltar)
- [ ] Modos texto/SVG/World continuam funcionando

### Anatomia final esperada (compare com o World)

```
server/src/core/<seumodo>.ts        (novo — engine)
server/src/ws/schemas.ts            (schemas + união estendida)
server/src/ws/hub.ts                (cases no switch + setEngine + disconnect)
server/src/core/eventlog.ts         (tipos de evento)
server/src/index.ts                 (instância + rota da página)
server/src/http/routes.ts           (/start /stop /state)
telao/src/components/XxxArena.tsx   (novo — view)
telao/src/App.tsx                   (rota da view)
client-browser/<seumodo>.html       (novo — cliente)
```
