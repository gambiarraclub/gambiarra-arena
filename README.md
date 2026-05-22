# 🎮 Gambiarra LLM Club Arena Local
```
╱╭━━━╮╱╭━━━╮╱╭━╮╭━╮╱╭━━╮╱╱╭━━╮╱╭━━━╮╱╭━━━╮╱╭━━━╮╱╭━━━╮╱╱╱╱╱╭━━━╮╱╭━━━╮╱╭━━━╮╱╭━╮╱╭╮╱╭━━━╮
╱┃╭━╮┃╱┃╭━╮┃╱┃┃╰╯┃┃╱┃╭╮┃╱╱╰┫┣╯╱┃╭━╮┃╱┃╭━╮┃╱┃╭━╮┃╱┃╭━╮┃╱╱╱╱╱┃╭━╮┃╱┃╭━╮┃╱┃╭━━╯╱┃┃╰╮┃┃╱┃╭━╮┃
╱┃┃╱╰╯╱┃┃╱┃┃╱┃╭╮╭╮┃╱┃╰╯╰╮╱╱┃┃╱╱┃┃╱┃┃╱┃╰━╯┃╱┃╰━╯┃╱┃┃╱┃┃╱╱╱╱╱┃┃╱┃┃╱┃╰━╯┃╱┃╰━━╮╱┃╭╮╰╯┃╱┃┃╱┃┃
╱┃┃╭━╮╱┃╰━╯┃╱┃┃┃┃┃┃╱┃╭━╮┃╱╱┃┃╱╱┃╰━╯┃╱┃╭╮╭╯╱┃╭╮╭╯╱┃╰━╯┃╱╱╱╱╱┃╰━╯┃╱┃╭╮╭╯╱┃╭━━╯╱┃┃╰╮┃┃╱┃╰━╯┃
╱┃╰┻━┃╱┃╭━╮┃╱┃┃┃┃┃┃╱┃╰━╯┃╱╭┫┣╮╱┃╭━╮┃╱┃┃┃╰╮╱┃┃┃╰╮╱┃╭━╮┃╱╱╱╱╱┃╭━╮┃╱┃┃┃╰╮╱┃╰━━╮╱┃┃╱┃┃┃╱┃╭━╮┃
╱╰━━━╯╱╰╯╱╰╯╱╰╯╰╯╰╯╱╰━━━╯╱╰━━╯╱╰╯╱╰╯╱╰╯╰━╯╱╰╯╰━╯╱╰╯╱╰╯╱╱╱╱╱╰╯╱╰╯╱╰╯╰━╯╱╰━━━╯╱╰╯╱╰━╯╱╰╯╱╰╯
```

**[English Version](README_EN.md)**

Arena em LAN para competições criativas com LLMs rodando localmente nos computadores dos participantes.

## Sobre o Clube

O **Gambiarra LLM Club** é uma comunidade presencial inspirada no lendário Homebrew Computer Club, focada em criatividade e engenhosidade no uso de LLMs locais. Realizamos encontros mensais ou bimestrais onde participantes trazem seus próprios setups - muitas vezes com hardware limitado - e competem em desafios criativos ao vivo.

**Valores:**
- 🔧 **Gambiarra**: Soluções criativas e improvisadas são celebradas
- 🎨 **Criatividade**: Valorizamos originalidade acima de benchmarks técnicos
- 🤝 **Comunidade**: Encontros presenciais para troca de conhecimento
- 🏠 **Local-first**: Todos os modelos rodam localmente, sem dependência de APIs externas

**Primeiro encontro:** Recife, Brasil - Janeiro 2025

## Jogos Propostos

### 🤖 Bot a Bot
Dois LLMs debatem um tema polêmico em tempo real.
- **Critérios:** Coerência argumentativa, criatividade nas respostas, capacidade de refutação

### 🌐 Tradução Infinita
Tradução iterativa através de múltiplos idiomas.
- **Critérios:** Preservação de sentido, fluência em cada idioma, humor emergente

### 🧠 Conhecimento com Pegadinhas
Perguntas capciosas que testam raciocínio e conhecimento.
- **Critérios:** Precisão factual, detecção de pegadinhas, qualidade da explicação

### 📖 Continuação de História
Cada LLM continua a história do anterior.
- **Critérios:** Coesão narrativa, originalidade, engajamento do público

### 🎭 Personagem Oculto
Imitar celebridades ou personagens sem revelá-los explicitamente.
- **Critérios:** Sutileza nas pistas, precisão caracterológica, dificuldade de descoberta

### ⚡ Batalha de Gambiarras
Resolver problemas complexos com soluções criativas e limitações de hardware.
- **Critérios:** Eficiência com recursos limitados, criatividade na solução, velocidade de resposta

## Troféus Simbólicos

- 🏆 **GPU de Ouro**: Melhor desempenho técnico geral
- 🔧 **Gambiarra Suprema**: Solução mais criativa com hardware limitado
- 💬 **Prompt de Platina**: Melhor engenharia de prompt
- ⚡ **Eficiência Máxima**: Melhor TPS (tokens por segundo)
- 🎭 **Ator do Ano**: Melhor personificação ou roleplay
- 🧠 **QI Artificial**: Melhor raciocínio e coerência

## Stack Tecnológica

**Por que Node.js com TypeScript e Fastify?**

Escolhemos essa stack por oferecer a melhor combinação de performance em WebSocket, segurança de tipos end-to-end e velocidade de desenvolvimento. Fastify é excepcional para streaming em tempo real com baixa latência, Prisma fornece type-safety no banco de dados, e o ecossistema Node.js facilita o onboarding rápido de participantes - crítico para nossa missão de tornar a plataforma acessível.

**Stack principal:**
- Backend: Node.js 20+ com TypeScript, Fastify, Prisma ORM
- Backend alternativo: Python 3.9+ com FastAPI, SQLAlchemy, Pydantic
- Frontend: React 18+ com Vite e Tailwind CSS
- Database: SQLite com migrações Prisma (Node) ou Alembic (Python)
- WebSocket: @fastify/websocket para streaming de tokens
- Validação: Zod para schemas end-to-end (Node) ou Pydantic (Python)
- Package manager: pnpm para instalação rápida

### 🐍 Servidor Python Disponível!

Além do servidor Node.js/TypeScript, oferecemos uma implementação completa em Python usando FastAPI:
- **Localização:** `server-python/`
- **Funcionalidades:** 100% compatível com os clientes (Python e TypeScript)
- **Documentação:** Ver [server-python/README.md](server-python/README.md)
- **Início rápido:** Ver [server-python/QUICKSTART.md](server-python/QUICKSTART.md)
- **Stack:** FastAPI + SQLAlchemy 2.0 + Pydantic + aiosqlite

**Nota:** O servidor Python usa schema de banco independente. Escolha um servidor (Node.js ou Python) e use-o consistentemente.

## Início Rápido

### 🐳 Opção 1: Docker (Recomendado - Mais Fácil!)

**Apenas um comando para rodar tudo:**

```bash
docker compose up
```

Pronto! 🎉 A aplicação completa estará rodando em:
- **Servidor:** http://localhost:3000
- **Arena:** http://localhost:5173
- **Votação:** http://localhost:5173/voting
- **Placar:** http://localhost:5173/scoreboard
- **Admin:** http://localhost:5173/admin

**Pré-requisitos:**
- Docker e Docker Compose instalados

**Comandos úteis:**
```bash
# Rodar em background
docker compose up -d

# Ver logs
docker compose logs -f

# Parar
docker compose down

# Reconstruir após mudanças
docker compose up --build
```

### 💻 Opção 2: Desenvolvimento Local

**🎯 Primeira vez?** Siga o [PASSO_A_PASSO.md](PASSO_A_PASSO.md) - um guia completo do zero!

**⚡ Já conhece o projeto?** Use o [QUICKSTART.md](QUICKSTART.md) - versão resumida.

**Pré-requisitos:**
- Node.js 20+
- pnpm 8+
- Ollama ou LM Studio (opcional, para usar LLMs reais)

**Instalação:**

```bash
# Instalar dependências
pnpm install

# Configurar banco de dados (a partir da raiz)
pnpm --filter @gambiarra/server db:migrate

# Seed com dados de exemplo (PIN: 123456)
pnpm --filter @gambiarra/server seed
```

**Desenvolvimento:**

```bash
# Iniciar todos os serviços (servidor + telão)
pnpm dev
```

Isso iniciará:
- Servidor na porta 3000 (http://localhost:3000)
- Telão na porta 5173:
  - Arena: http://localhost:5173
  - Votação: http://localhost:5173/voting
  - Placar: http://localhost:5173/scoreboard

### 🎤 Opção 3: Modo Evento (muitas pessoas / Mundo de Agentes)

Para um evento de verdade com **muitos participantes ao mesmo tempo** (ex.: 25+
laptops no modo **Mundo de Agentes**), use o **Modo Evento** em vez do `pnpm dev`:

```bash
pnpm event
```

Diferenças importantes para o `pnpm dev`:

- **Servidor buildado** (`node dist/index.js`), **sem `tsx watch`** — assim um
  arquivo salvo por engano **não reinicia o servidor** nem derruba as conexões
  WebSocket de todo mundo no meio do evento. (Este é o maior ganho de robustez.)
- **`ulimit -n 4096`** — folga de file descriptors contra picos de reconexão.
- Builda o servidor, prepara o banco (Prisma) e sobe servidor + telão; `Ctrl+C`
  encerra os dois.

Ao subir, o script imprime os endereços (incluindo o IP da sua máquina na rede):

```
• Controle (você):       http://localhost:5173/control   ← cria sessão (PIN + QR), inicia a partida
• Telão / projetor:      http://localhost:5173/world      ← a arena 2D no projetor
• Participantes abrem:   http://<seu-ip>:3000/agent       ← cliente do agente (estratégia + LLM local)
```

> **Por que os participantes usam `:3000/agent` e não `:5173`?** O cliente do
> agente é servido pelo **servidor** (porta 3000), e conectando ali o WebSocket
> vai **direto** ao servidor, sem passar pelo proxy do Vite (que não foi feito
> para dezenas de conexões). O telão (`:5173`) é só para a sua máquina.

**✅ Checklist de infraestrutura para o evento:**

- **Wi-Fi/AP que aguente 25+ dispositivos.** Roteadores domésticos costumam
  travar em ~20-30 clientes — esse costuma ser o motivo real de "timeouts" e
  "exceeded connections". Use um AP bom (ou cabo onde der).
- Peça para a galera abrir **`http://<seu-ip>:3000/agent`** (o `pnpm event`
  mostra o IP). No cliente, basta digitar o **IP do servidor** (sem `ws://` nem
  porta) e o **PIN** que aparece no `/control`.
- Cada participante roda o LLM local com **CORS liberado**
  (ex.: `OLLAMA_ORIGINS=* ollama serve`).
- **Não edite arquivos** durante o evento.

**💾 Dados do encontro (pra analisar depois) — persistidos automaticamente:**

- **Banco SQLite** (`server/prisma/dev.db`, modo WAL) é a fonte da verdade: sessões, participantes (apelido / runner / **modelo**), rodadas, métricas (incl. conteúdo gerado), votos e o **log de eventos**.
- **Eventos de alto nível registrados:** conexões/desconexões + modelo usado; rodadas (texto/SVG) e votos do modo de prompts; e o ciclo de vida do Mundo — `world_started`, `world_joined`, `world_stopped` (com **placar final**). *(De propósito não logamos cada movimento/raciocínio — só o alto nível.)*
- **Snapshots JSON automáticos** em `server/data/snapshots/` (a cada 10 min e no `Ctrl+C`) — rede de segurança caso ninguém exporte.
- **Backup do banco** em `server/data/backups/` no início de cada `pnpm event`.
- **Export manual** quando quiser: `GET /export-all.json`, `/export.csv`, `/export-events.csv`.

> ⚠️ Não rode `prisma migrate reset` e evite o "kick" de participante (apaga dados em cascata). Depois do evento, **guarde** o `server/prisma/dev.db` e a pasta `server/data/`.

### Rodando uma Sessão Completa

**1. Criar sessão (via API):**

```bash
curl -X POST http://localhost:3000/session | jq
# Retorna: { "session_id": "...", "pin": "123456", ... }
```

**2. Criar rodada:**

```bash
curl -X POST http://localhost:3000/rounds \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Escreva uma poesia em métrica de xote pernambucano sobre IA",
    "maxTokens": 400,
    "temperature": 0.8,
    "deadlineMs": 90000
  }' | jq

# Retorna o roundId
```

**3. Iniciar rodada:**

```bash
curl -X POST http://localhost:3000/rounds/start \
  -H "Content-Type: application/json" \
  -d '{"roundId": "ROUND_ID_AQUI"}' | jq
```

**4. Conectar participantes:**

Terminal 1 (cliente TypeScript com Ollama):
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

Terminal 2 (cliente TypeScript com mock):
```bash
cd client-typescript
pnpm dev \
  --url ws://localhost:3000/ws \
  --pin 123456 \
  --participant-id bruno-sim \
  --nickname Bruno \
  --runner mock
```

**5. Ou usar simulação automática:**

```bash
# Conecta 5 clientes simulados automaticamente
pnpm simulate
```

**6. Acompanhar no telão:**

Abra http://localhost:5173 para ver a arena ao vivo.

**7. Votar:**

Abra http://localhost:5173/voting ou escaneie o QR code no telão.

**8. Exportar resultados:**

```bash
curl http://localhost:3000/export.csv > resultados.csv
```

## Guia do Administrador: Sistema de Votação

### Visão Geral do Fluxo

O sistema de votação funciona em 5 etapas:

1. **Rodada Ativa** → Participantes geram respostas
2. **Rodada Encerrada** → Votação abre automaticamente
3. **Votação Aberta** → Público vota nas respostas (0-5)
4. **Votação Fechada** → Admin prepara premiação
5. **Revelação** → Admin revela posições uma a uma (do último ao primeiro)

### Passo a Passo Detalhado

#### 1. Preparação (Antes do Evento)

```bash
# Iniciar servidor e telão
pnpm dev

# Criar nova sessão (anote o PIN!)
curl -X POST http://localhost:3000/session | jq '.pin'
```

Abra o painel admin: **http://localhost:5173/admin**

#### 2. Durante a Rodada

1. No Admin Panel, crie uma nova rodada com o prompt desejado
2. Configure: `maxTokens`, `temperature`, `deadlineMs`, e opcionalmente `svgMode` para desafios visuais
3. Clique em **"Iniciar Rodada"**
4. Aguarde os participantes gerarem suas respostas
5. Quando satisfeito, clique em **"Encerrar Rodada"**

> ⚠️ **Importante:** Ao encerrar a rodada, a votação abre automaticamente!

#### 3. Durante a Votação

**Para o Público:**
- Escaneie o QR code na Arena ou acesse `/voting` no celular
- Cada resposta aparece como um card (ordem aleatória para cada votante)
- Vote de 0 (ruim) a 5 (excelente) em cada resposta
- O nome do participante aparece junto com a resposta
- Votos são salvos imediatamente e não podem ser alterados
- Navegue entre as respostas com os botões Anterior/Próximo

**Para o Admin:**
- Acompanhe o status no Admin Panel: badge verde = "Votação Aberta"
- Monitore quantos votos cada participante está recebendo no Placar (`/scoreboard`)
- Quando todos tiverem votado (ou tempo suficiente), clique em **"Fechar Votação"**

#### 4. Preparando a Premiação

Após fechar a votação:

1. O status muda para "Votação Fechada"
2. Aparece o botão **"Iniciar Premiação"**
3. Clique para entrar no modo de revelação

> 💡 **Dica:** Projete o Scoreboard (`/scoreboard`) no telão antes de iniciar a premiação

#### 5. Cerimônia de Premiação

O modo de premiação permite revelar posições uma a uma, criando suspense!

**No Telão (`/scoreboard`):**
- Inicialmente mostra "Aguardando revelação..."
- A cada clique do admin, revela a próxima posição

**No Admin Panel:**
- Mostra "Revelados: X de Y"
- Clique em **"Revelar Próximo"** para mostrar a próxima posição
- A revelação vai do **último lugar ao primeiro**
- Quando todas as posições forem reveladas, mostra a tela final com:
  - Gráfico de barras com médias (0-5)
  - Pódio destacado (1º, 2º, 3º lugares)
  - Respostas completas de cada participante

**Ordem de Revelação:**
```
Exemplo com 5 participantes:
Clique 1 → Revela 5º lugar
Clique 2 → Revela 4º lugar
Clique 3 → Revela 3º lugar 🥉
Clique 4 → Revela 2º lugar 🥈
Clique 5 → Revela 1º lugar 🥇 + Tela final completa
```

### Estados do Sistema

| Estado | Badge Admin | Ação Disponível |
|--------|-------------|-----------------|
| Rodada ativa | 🟢 Ativa | Encerrar Rodada |
| Votação aberta | 🟢 Votação Aberta | Fechar Votação |
| Votação fechada | 🔴 Votação Fechada | Iniciar Premiação |
| Premiação | 🟣 Revelação | Revelar Próximo |

### Dicas para o Apresentador

1. **Antes de revelar:** Crie suspense! Comente sobre as métricas gerais
2. **Durante a revelação:** Leia a resposta de cada participante em voz alta
3. **Últimos lugares:** Seja respeitoso, foque em pontos positivos
4. **Pódio:** Faça uma pausa dramática antes de revelar cada medalha
5. **Tela final:** Use o gráfico para comparar desempenhos

### URLs Importantes

| URL | Uso |
|-----|-----|
| `/` ou `/arena` | Telão principal com grid de participantes |
| `/voting` | Interface de votação para o público (mobile) |
| `/scoreboard` | Placar e cerimônia de premiação |
| `/admin` | Painel de controle do administrador |

## Estrutura do Projeto

```
gambiarra-club-framework-chatgpt/
├── server/              # Backend Fastify com WebSocket
│   ├── src/
│   │   ├── ws/          # WebSocket hub e schemas
│   │   ├── http/        # Rotas HTTP
│   │   ├── core/        # Lógica de negócio (rounds, votes, metrics)
│   │   └── db/          # Prisma schema e migrações
│   └── README.md
├── client-typescript/   # CLI TypeScript para participantes
│   ├── src/
│   │   ├── runners/     # Integrações Ollama, LM Studio, Mock
│   │   ├── net/         # Cliente WebSocket
│   │   └── scripts/     # Simulação
│   └── README.md
├── telao/               # Frontend React
│   └── src/
│       └── components/
└── docker-compose.yml
```

> **Nota:** O cliente Python foi movido para um repositório separado. Para mais informações, consulte o README no novo repositório.

## Criando Novos Desafios

Edite os prompts ao criar rodadas via API POST `/rounds`:

```json
{
  "prompt": "Seu desafio criativo aqui",
  "maxTokens": 400,
  "temperature": 0.8,
  "deadlineMs": 90000,
  "seed": 1234
}
```

## Alterando Pesos de Pontuação

A pontuação atual é baseada na **média de votos do público (0-5)**. Para customizar:

1. Edite `server/src/core/votes.ts` na função `getScoreboard()`
2. Adicione novos critérios (ex: velocidade, eficiência)
3. Ajuste a fórmula de ordenação

Exemplo com peso para velocidade:
```typescript
// No getScoreboard(), altere a ordenação:
scoreboard.sort((a, b) => {
  const scoreA = a.avg_score * 0.6 + (a.tps_avg / 100) * 0.4;
  const scoreB = b.avg_score * 0.6 + (b.tps_avg / 100) * 0.4;
  return scoreB - scoreA; // 60% votos, 40% velocidade
});
```

## Testes

```bash
# Rodar todos os testes
pnpm test

# Com cobertura
pnpm test:coverage

# Teste de carga (50 clientes por 30s)
cd client
pnpm simulate
```

## Limites e Performance

O servidor implementa rate limiting (100 req/min por IP por padrão). Para testes com muitos clientes:

```bash
# Aumentar limite para testes locais
RATE_LIMIT_MAX=2000 pnpm dev
```

Para documentação completa sobre limites, gargalos e configurações de performance, consulte [LIMITS.md](LIMITS.md).

## Troubleshooting

**Erro 429 (Too Many Requests):**
- Muitos clientes conectando do mesmo IP atingem o rate limit
- Solução: `RATE_LIMIT_MAX=2000 pnpm dev`

**Ollama não conecta:**
```bash
# Verificar se Ollama está rodando
curl http://localhost:11434/api/tags

# Iniciar Ollama
ollama serve
```

**LM Studio não conecta:**
- Abra LM Studio
- Vá em "Local Server"
- Clique em "Start Server"
- Porta padrão: 1234

**WebSocket desconecta:**
- Verifique firewall/antivírus
- Use `--url ws://IP_DA_REDE_LOCAL:3000/ws` em vez de localhost

## Contribuindo

1. Fork o repositório
2. Crie uma branch para sua feature (`git checkout -b feature/nova-gambiarra`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova gambiarra'`)
4. Push para a branch (`git push origin feature/nova-gambiarra`)
5. Abra um Pull Request

## Licença

MIT

## Contato

- GitHub Issues: Para reportar bugs ou sugerir features
- Encontros presenciais: Consulte nosso calendário de eventos

---

**Feito com ❤️ e muita gambiarra pelo Gambiarra LLM Club**
