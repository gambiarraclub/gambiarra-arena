# Pós-encontro: backup, análise e relatório

> **Para quem é:** um agente de código (ou pessoa) encarregado do ritual
> pós-evento. Siga as etapas NA ORDEM. Os relatórios anteriores desta pasta
> (`encontro-2026-05-23.html`, `encontro-2026-07-11.html`) e seus geradores
> (`gen_encontro-*.py`) são os gabaritos — copie o padrão, não invente.

## O ritual em uma linha

**backup → inventário → análise → geração → verificação visual → distribuição**

Nunca pule o backup e nunca pule a verificação visual. São as duas etapas que
parecem dispensáveis e nunca são.

---

## Regras de ouro (aprendidas em produção)

1. **Backup ANTES de qualquer análise.** Pasta datada nova em
   `~/Dropbox/BACKUPS/GAMBIARRA_ARENA/backup-AAAAMMDD-HHMMSS[-slug]/` — nunca
   sobrescreva um backup existente, nunca toque nos arquivos originais.
2. **Os dados do encontro são sagrados.** Abra o SQLite em leitura; jamais
   rode experimento, migração ou teste no banco do evento. Precisa testar
   algo? `DATABASE_URL="file:/tmp/teste.db"`.
3. **Timestamps são epoch em milissegundos.** Sempre
   `datetime(ts/1000,'unixepoch','localtime')`. Ao comparar com
   `strftime('%s',...)`, faça `CAST(... AS INTEGER)*1000` — comparar inteiro
   com string falha SILENCIOSAMENTE no SQLite (retorna vazio, não erro).
4. **Não confie no código: olhe o render.** Todo gráfico/galeria/frame novo é
   verificado com screenshot em headless Chrome antes de entregar — nos modos
   claro E escuro.
5. **Números do relatório saem de query, não de memória.** Cada estatística
   citada precisa ser reproduzível por uma consulta ao banco ou ao log.
6. **Sessões de teste existem.** Todo dia de evento tem sessões da manhã de
   preparação. Identifique pelo horário/participantes quais sessões são O
   EVENTO antes de calcular qualquer coisa.

---

## Etapa 1 — Backup

O que copiar (tudo que o dia produziu):

```bash
BK=~/Dropbox/BACKUPS/GAMBIARRA_ARENA/backup-$(date +%Y%m%d-%H%M%S)-encontroN
mkdir -p "$BK"
rsync -a \
  server/prisma/<banco-do-dia>.db \
  server/logs/server-AAAA-MM-DD.log \
  server/data \
  "$BK/"
du -sh "$BK" && find "$BK" -type f | wc -l   # confira tamanho e contagem
```

- O banco do dia: veja `DATABASE_URL` no `server/.env` (ritual do banco novo
  por encontro). Se o evento usou o `dev.db` padrão, copie-o.
- `server/data/` traz os snapshots de sessão e os backups automáticos do
  `pnpm event`.
- Ao final do ritual, copie o relatório e o gerador para dentro do backup
  também (o backup deve se explicar sozinho).

**Checkpoint:** `find "$BK" -type f | wc -l` > 0 e `du -sh` compatível com o
esperado (dezenas de MB). Só então prossiga.

## Etapa 2 — Inventário

Antes de qualquer narrativa, descubra O QUE existe:

```bash
DB=server/prisma/<banco-do-dia>.db   # caminho direto, sem ?mode=ro (ver Armadilhas)

# sessões do dia (separe teste vs evento pelo horário)
sqlite3 "$DB" "SELECT substr(id,1,8), datetime(createdAt/1000,'unixepoch','localtime'), status FROM sessions ORDER BY createdAt;"

# rodadas com prompt e status
sqlite3 "$DB" "SELECT substr(sessionId,1,8), \"index\", substr(prompt,1,70), svgMode, datetime(startedAt/1000,'unixepoch','localtime'), votingStatus FROM rounds ORDER BY startedAt;"

# a foto geral: tipos de evento e volumes
sqlite3 "$DB" "SELECT eventType, count(*) FROM event_logs GROUP BY eventType ORDER BY count(*) DESC;"

# distribuição de mensagens do log (revela incidentes na hora)
python3 -c "
import json, collections
c = collections.Counter()
for l in open('server/logs/server-AAAA-MM-DD.log'):
    try: c[json.loads(l).get('msg','?')] += 1
    except: pass
[print(n, m) for m, n in c.most_common(30)]"
```

**Checkpoint:** você sabe dizer quais sessões são o evento, quantas rodadas
valem, e se houve incidentes (429, WS_DEAD, restarts) — antes de escrever
uma linha de relatório.

## Etapa 3 — Análise (o cardápio padrão)

Consultas que todo relatório usa (adapte IDs de sessão):

| O quê | Fonte |
|---|---|
| Participantes/modelos únicos | `participants` (DISTINCT nickname / model) |
| Votos por rodada + pódio | `votes` × `rounds` × `participants` (pontuação = soma dos scores) |
| Métricas de geração (tokens, tps) | `metrics` × `rounds` |
| Conteúdo gerado (galeria de SVGs) | `metrics.generatedContent` |
| Placar final do World | `event_logs` `world_stopped` → `metadata.scores` |
| Pico de ocupação do World + frame real | `event_logs` `world_snapshot` (ordene por `json_array_length(metadata→agents)`) |
| Engenharia de prompt | `event_logs` `agent_prompt_changed` (filtre `isDefault=0`) |
| Tráfego/min, 429s, IPs, reconexões | log estruturado (`incoming request`, `HTTP_429`, `WS_DEDUP`, `WS_REGISTERED`) |

Guarde séries intermediárias (ex.: requisições/min) em JSON no diretório de
rascunho — o gerador consome delas ou refaz as queries direto.

## Etapa 4 — Geração do relatório

**Não comece do zero.** Copie o gerador do encontro anterior:

```bash
cp docs/reports/gen_encontro-<ANTERIOR>.py docs/reports/gen_encontro-AAAA-MM-DD.py
```

O que os geradores existentes já dão de graça (reutilize, não reescreva):

- `hbar_chart` — barras horizontais com ticks redondos (`nice_ticks`), rótulos
  diretos e tooltip; `timeseries_chart` — série por minuto com anotações de
  momentos do evento;
- `extract_svg` — extrai e **repara** SVGs truncados no limite de tokens
  (corta no último tag completo e fecha os abertos) — sem isso os vencedores
  somem da galeria; `svg_img` — embute como `<img src="data:...">` (sandbox
  natural: SVG quebrado não come a página);
- `world_frame_svg` — desenha o frame do World a partir de um `world_snapshot`
  (posições, comidas, balões de fala reais);
- CSS completo: paleta clara/escura já validada (contraste/CVD), tiles,
  timeline, galeria, tabelas, tooltip JS e botão de tema.

O que muda a cada encontro é a **narrativa**: título, tiles, anotações do
gráfico de atividade, linha do tempo, seções específicas do dia e as
curiosidades. Fontes das curiosidades: apelidos, recordes, falhas engraçadas
dos modelos, comparativos com encontros anteriores — sempre ancoradas em dado.

Estrutura consagrada das seções (mantenha a ordem):

1. Hero (kicker com nº do encontro/tema + título-manchete + tiles)
2. Atividade minuto a minuto (com anotações dos momentos)
3. Linha do tempo narrada
4. World (frame do pico + placar)
5. Rodadas (a mais disputada primeiro) + galeria de SVGs (pódio por rodada)
6. Seções específicas do dia (ex.: engenharia de prompt, comparativo com o
   encontro anterior)
7. Curiosidades
8. Footer com as FONTES exatas (arquivos e contagens)

## Etapa 5 — Verificação visual (obrigatória)

```bash
python3 docs/reports/gen_encontro-AAAA-MM-DD.py
C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$C" --headless --disable-gpu --hide-scrollbars --window-size=1200,3400 \
  --screenshot=/tmp/r_top.png "file://$PWD/docs/reports/encontro-AAAA-MM-DD.html"
# repita com janela mais alta para o meio/fim, e uma vez com data-theme="dark"
```

Checklist do olho (cada item já foi bug real):

- [ ] Pódios completos na galeria (1º/2º/3º presentes — se sumiu alguém, é SVG
      truncado sem reparo)
- [ ] Ticks dos eixos redondos (0/10/20/30, nunca 0/13/27/41)
- [ ] Anotações do gráfico de atividade sem colisão de texto
- [ ] Nenhum placeholder vazado tipo `{{objetivo}}` mal-escapado de f-string
      (chaves literais em f-string exigem quadruplicar: `{{{{` — prefira interpolar uma variável)
- [ ] Modo escuro legível (não é inversão automática; o CSS já tem os dois)
- [ ] Números dos tiles batem com as queries da Etapa 3

## Etapa 6 — Distribuição

1. `docs/reports/encontro-AAAA-MM-DD.html` + `gen_...py` (ficam no repo;
   commit **só quando o usuário pedir**, via branch + PR);
2. Cópia do HTML na pasta do encontro no Dropbox
   (`~/Dropbox/APROJETOS_CIn/GAMBIARRA CLUB/ENCONTRO_N/`) — é o que o
   organizador envia ao grupo;
3. Cópia do HTML + gerador dentro da pasta de backup da Etapa 1.

---

## Armadilhas conhecidas

| Sintoma | Causa e solução |
|---|---|
| `sqlite3 "file:x.db?mode=ro"` → `unable to open database file (14)` | Banco em modo WAL com `-wal` pendente não abre read-only. Com o servidor parado, abra pelo caminho direto; ou trabalhe na CÓPIA do backup. |
| Query com data retorna vazio sem erro | Comparou `timestamp` (inteiro) com `strftime(...)` (string). Use `CAST(strftime('%s','...') AS INTEGER)*1000`. |
| Vencedores faltando na galeria | SVG truncado no limite de tokens (sem `</svg>`). O `extract_svg` dos geradores repara — use-o, e marque "truncado, restaurado" na legenda. |
| Texto embaralhado tipo `{{('}}x{(')}}` no HTML | Chaves literais dentro de f-string. Coloque `{{placeholder}}` numa variável e interpole a variável. |
| Screenshot do usuário com 0 bytes | Placeholder "online-only" do Dropbox — peça para colar o conteúdo ou usar outro caminho. |
| Estatística do World sem posições (encontros ≤ 5º) | `world_snapshot` só existe desde 11/07/2026. Para eventos anteriores, reconstrua por aproximação (ver `gen_encontro-2026-05-23.py` e o LEIA-ME do frame do 5º no Dropbox) e DECLARE o que é sintetizado. |
| Números diferentes entre log e banco | O log conta o dia inteiro (inclui manhã de testes); o banco pode ter sessões de teste. Filtre por sessão/horário e diga no relatório qual recorte usou. |

## Gabaritos

- `gen_encontro-2026-05-23.py` — reconstrução SEM snapshots (aproximação
  declarada), seções de incidente (429/flicker), sonetos.
- `gen_encontro-2026-07-11.py` — frame REAL do World via `world_snapshot`,
  seção de engenharia de prompt (`agent_prompt_changed`), tabela comparativa
  entre encontros.
