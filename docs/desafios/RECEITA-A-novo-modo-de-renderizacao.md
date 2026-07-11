# RECEITA A — Novo modo de renderização (padrão `svgMode`)

> **O que você vai fazer:** adicionar uma flag booleana à rodada (como o
> `svgMode`) e um renderizador novo nas telas. A dinâmica (prompt → geração →
> votação) não muda.
>
> **Método:** em cada passo, ABRA o arquivo indicado, PROCURE a âncora textual,
> FAÇA a edição espelhando o padrão do `svgMode`, e RODE o checkpoint. Não
> avance com checkpoint falhando.
>
> **Exemplo usado nesta receita:** `poemMode` ("Modo Poesia" — a resposta
> aparece centralizada, em fonte serifada itálica, como um poema no telão).
> Troque `poemMode`/"Poesia" pelo nome do SEU modo em todos os passos.
> Convenção de nome: `algumaCoisaMode` (camelCase, sufixo `Mode`).

---

## Passo 0 — Sanidade do ambiente

```bash
cd <raiz-do-repo>
pnpm --filter @gambiarra/server build && pnpm --filter telao build
```

**Checkpoint:** os dois builds passam ANTES de você tocar em qualquer coisa.
Se não passam, pare e reporte — o problema não é seu.

---

## Passo 1 — Banco: campo no modelo `Round`

**Arquivo:** `server/prisma/schema.prisma`
**Procure:** `svgMode       Boolean   @default(false)`
**Faça:** adicione uma linha igual logo abaixo, com o seu nome:

```prisma
  poemMode      Boolean   @default(false)
```

**Checkpoint:**

```bash
cd server && npx prisma migrate dev --name add_poem_mode && npx prisma generate
```

Deve criar uma migração nova e regenerar o client sem erro.
⚠️ Isso roda no banco apontado pelo `.env` (dev). Nunca rode contra um banco
de evento histórico.

---

## Passo 2 — REST: aceitar a flag na criação da rodada

**Arquivo:** `server/src/http/routes.ts`
**Procure:** `svgMode: z.boolean().optional(),` (dentro de `CreateRoundSchema`)
**Faça:** adicione abaixo:

```ts
  poemMode: z.boolean().optional(),
```

---

## Passo 3 — Ciclo de vida: persistir e transmitir a flag

**Arquivo:** `server/src/core/rounds.ts` — são **três** âncoras neste arquivo:

1. **Procure** `svgMode?: boolean;` (interface `CreateRoundParams`) → adicione
   `poemMode?: boolean;` abaixo.
2. **Procure** `svgMode: params.svgMode ?? false,` (dentro de `createRound`) →
   adicione `poemMode: params.poemMode ?? false,` abaixo.
3. **Procure** `svgMode: boolean;` (tipo `RoundRecord`) e depois
   `svgMode: round.svgMode,` (dentro de `broadcastRoundState`) → adicione o
   campo novo nos DOIS lugares. Sem isso o push `round_state` não carrega a
   flag e a votação não fica sabendo do modo.

**Checkpoint:**

```bash
pnpm --filter @gambiarra/server build
```

---

## Passo 4 — Votação/placar: expor a flag nas respostas

**Arquivo:** `server/src/core/votes.ts` — **duas** âncoras:

1. **Procure** `svgMode: round?.svgMode ?? false,` → adicione
   `poemMode: round?.poemMode ?? false,` abaixo.
2. **Procure** `svgMode: round.svgMode,` → adicione
   `poemMode: round.poemMode,` abaixo.

**Checkpoint:** build do servidor passa de novo.

> **Não mexa** em `server/src/ws/hub.ts`: o `state_snapshot` envia a rodada
> inteira vinda do banco, então a flag nova já vai junto automaticamente.

---

## Passo 5 — Admin: checkbox para criar rodada no modo novo

**Arquivo:** `telao/src/components/AdminPanel.tsx` — **quatro** âncoras:

1. **Procure** `svgMode: boolean;` (interface `Round`) → adicione
   `poemMode: boolean;` abaixo.
2. **Procure** `const [svgMode, setSvgMode] = useState(false);` → adicione
   `const [poemMode, setPoemMode] = useState(false);` abaixo.
3. **Procure** `svgMode` dentro do `body: JSON.stringify({ ... })` do POST
   `/rounds` → adicione `poemMode` ao objeto.
4. **Procure** o bloco do checkbox `id="svgMode"` → duplique o bloco inteiro
   logo abaixo, trocando `svgMode`→`poemMode`, o rótulo para
   `Modo Poesia` e a descrição para algo como
   `Quando ativado, o telão mostrará a resposta como um poema.`

---

## Passo 6 — Telão: repassar a flag ao card

**Arquivo:** `telao/src/components/Arena.tsx` — **duas** âncoras:

1. **Procure** `svgMode: boolean;` (interface `Round`) → adicione
   `poemMode: boolean;` abaixo.
2. **Procure** `svgMode={currentRound?.svgMode || false}` (props do
   `<ParticipantCard>`) → adicione na linha seguinte:
   `poemMode={currentRound?.poemMode || false}`.

---

## Passo 7 — Card do telão: o renderizador novo

**Arquivo:** `telao/src/components/ParticipantCard.tsx`

1. **Procure** `svgMode?: boolean;` (props) → adicione `poemMode?: boolean;`.
2. **Procure** `svgMode = false,` (desestruturação) → adicione
   `poemMode = false,`.
3. **Procure** o trecho `svgMode ? (` na área de conteúdo. A estrutura atual é
   `svgMode ? (<SvgRenderer .../>) : (<texto puro>)`. Transforme em cadeia,
   colocando o modo novo ANTES do fallback de texto:

```tsx
svgMode ? (
  /* ...bloco existente do SvgRenderer, NÃO altere... */
) : poemMode ? (
  <div className="mt-3 p-4 rounded-lg border-2 border-[var(--color-surface-light)] bg-[var(--color-midnight)]">
    <p className="text-center italic font-serif text-lg text-gray-100 whitespace-pre-wrap leading-relaxed">
      {content}
    </p>
  </div>
) : (
  /* ...bloco existente de texto puro, NÃO altere... */
)
```

**Checkpoint:** `pnpm --filter telao build` passa.

---

## Passo 8 — Votação (celular)

**Arquivo:** `telao/src/components/Voting.tsx`

1. **Procure** `svgMode: boolean;` (interface `Round`) → adicione o campo novo.
2. **Procure** `const [svgMode, setSvgMode] = useState(false);` → adicione um
   estado igual para o modo novo.
3. **Procure** `setSvgMode(data.svgMode);` (em `fetchVotingData`) → adicione
   `setPoemMode(data.poemMode);` abaixo (o campo vem do Passo 4).
4. **Procure** o render `{currentSvg ? (` — mesma técnica do Passo 7: insira o
   ramo do modo novo entre o ramo SVG e o fallback de texto, com o mesmo JSX
   do card (ajuste apenas classes de tamanho para celular se quiser).

---

## Passo 9 — Placar (cerimônia)

**Arquivo:** `telao/src/components/Scoreboard.tsx`

1. **Procure** `svgMode: boolean;` (interface `ScoreboardData`) → adicione o
   campo novo.
2. **Procure** `const { scoreboard, svgMode, votingStatus` → adicione o campo
   novo à desestruturação.
3. **Procure** `{svgMode ? (` no bloco de `generated_content` → mesma cadeia
   dos Passos 7 e 8.

**Checkpoint:** `pnpm --filter telao build` passa.

---

## Passo 10 (opcional) — Preview no cliente `/client`

Só faça se o modo novo tiver uma visualização própria no lado do participante.
O padrão está em `client-browser/client.html`, função `maybeRenderSvg` (que usa
`extractSvg/fitSvg/sanitizeSvg` de `client-browser/shared/svg.js`). Para um
modo textual como Poesia, **não é necessário** — o stream de texto já aparece.

⚠️ Se for renderizar conteúdo do modelo como HTML, **obrigatório** passar por
`sanitizeSvg`-like (nunca `innerHTML` cru).

---

## Passo 11 — Teste de fumaça de ponta a ponta

```bash
# servidor com banco descartável
cd server
DATABASE_URL="file:/tmp/poema-teste.db" npx prisma migrate deploy
DATABASE_URL="file:/tmp/poema-teste.db" node dist/index.js &

# em outro terminal: telão
cd telao && pnpm dev &

# sessão
curl -s -X POST localhost:3000/session -H 'content-type: application/json' -d '{}'
# → anote o "pin"

# cliente mock (use o pin anotado)
cd client-typescript
pnpm dev -- --url ws://localhost:3000/ws --pin <PIN> \
  --participant-id teste-1 --nickname "Teste" --runner mock

# rodada no modo novo
curl -s -X POST localhost:3000/rounds -H 'content-type: application/json' \
  -d '{"prompt":"Escreva um haicai sobre capivaras","maxTokens":120,"poemMode":true}'
# → anote o "id"
curl -s -X POST localhost:3000/rounds/start -H 'content-type: application/json' \
  -d '{"roundId":"<ID>"}'
```

**Critérios de aceite (verifique um a um):**

- [ ] `http://localhost:5173/` — o card do participante renderiza no modo novo
- [ ] `POST /rounds/stop` com o roundId → `http://localhost:5173/voting` mostra
      a resposta no modo novo e o voto funciona
- [ ] `close-voting` + `reveal` → `http://localhost:5173/scoreboard` renderiza
      no modo novo
- [ ] Criar e rodar uma rodada SEM a flag → tudo continua como texto puro
- [ ] Criar e rodar uma rodada com `svgMode:true` → o modo SVG continua intacto
- [ ] `pnpm --filter @gambiarra/server exec vitest run` — testes passam

## Passo 12 — Registrar o desafio

Adicione o prompt-modelo do desafio novo em `promptTemplates` no
`AdminPanel.tsx` (procure `const promptTemplates`) e, se fizer sentido, na
seção "Jogos Propostos" do `README.md` da raiz.

---

### Resumo dos arquivos tocados (confira no `git diff` ao final)

```
server/prisma/schema.prisma          (+1 campo, +1 migração)
server/src/http/routes.ts            (+1 linha no CreateRoundSchema)
server/src/core/rounds.ts            (+4 linhas: params, create, tipo, broadcast)
server/src/core/votes.ts             (+2 linhas)
telao/src/components/AdminPanel.tsx  (interface, estado, POST, checkbox)
telao/src/components/Arena.tsx       (interface, prop)
telao/src/components/ParticipantCard.tsx (props, ramo de render)
telao/src/components/Voting.tsx      (interface, estado, fetch, ramo)
telao/src/components/Scoreboard.tsx  (interface, desestruturação, ramo)
```

Qualquer arquivo fora desta lista no diff = provável engano; reveja.
