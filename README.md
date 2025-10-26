# 🎮 Gambiarra LLM Club Arena Local

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
- Frontend: React 18+ com Vite e Tailwind CSS
- Database: SQLite com migrações Prisma
- WebSocket: @fastify/websocket para streaming de tokens
- Validação: Zod para schemas end-to-end
- Package manager: pnpm para instalação rápida

## Início Rápido

**🎯 Primeira vez?** Siga o [PASSO_A_PASSO.md](PASSO_A_PASSO.md) - um guia completo do zero!

**⚡ Já conhece o projeto?** Use o [QUICKSTART.md](QUICKSTART.md) - versão resumida.

### Pré-requisitos

- Node.js 20+
- pnpm 8+
- Ollama ou LM Studio (opcional, para usar LLMs reais)

### Instalação

```bash
# Instalar dependências
pnpm install

# Configurar banco de dados (a partir da raiz)
pnpm --filter @gambiarra/server db:migrate

# Seed com dados de exemplo (PIN: 123456)
pnpm --filter @gambiarra/server seed
```

### Desenvolvimento

```bash
# Iniciar todos os serviços (servidor + telão)
pnpm dev
```

Isso iniciará:
- Servidor na porta 3000 (http://localhost:3000)
- Telão na porta 5173:
  - Arena: http://localhost:5173
  - Votação: http://localhost:5173?view=voting
  - Placar: http://localhost:5173?view=scoreboard

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

Terminal 1 (cliente real com Ollama):
```bash
cd client
pnpm dev \
  --url ws://localhost:3000/ws \
  --pin 123456 \
  --participant-id ana-desktop \
  --nickname Ana \
  --runner ollama \
  --model llama3.1:8b
```

Terminal 2 (cliente simulado):
```bash
cd client
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

Abra http://localhost:5173?view=voting ou escaneie o QR code no telão.

**8. Exportar resultados:**

```bash
curl http://localhost:3000/export.csv > resultados.csv
```

## Produção com Docker

```bash
# Build e iniciar
docker compose up --build

# Servidor: http://localhost:3000
# Telão:
#   - Arena: http://localhost:5173
#   - Votação: http://localhost:5173?view=voting
#   - Placar: http://localhost:5173?view=scoreboard
```

## Estrutura do Projeto

```
gambiarra-club-framework-chatgpt/
├── server/          # Backend Fastify com WebSocket
│   ├── src/
│   │   ├── ws/      # WebSocket hub e schemas
│   │   ├── http/    # Rotas HTTP
│   │   ├── core/    # Lógica de negócio (rounds, votes, metrics)
│   │   └── db/      # Prisma schema e migrações
│   └── README.md
├── client/          # CLI para participantes
│   ├── src/
│   │   ├── runners/ # Integrações Ollama, LM Studio, Mock
│   │   ├── net/     # Cliente WebSocket
│   │   └── scripts/ # Simulação
│   └── README.md
├── telao/           # Frontend React
│   └── src/
│       └── components/
└── docker-compose.yml
```

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

A pontuação atual é baseada em votos do público (1-5). Para customizar:

1. Edite `server/src/core/votes.ts` na função `getScoreboard()`
2. Adicione novos critérios (ex: velocidade, eficiência)
3. Ajuste a fórmula de `total_score`

Exemplo:
```typescript
return {
  // ... outros campos
  total_score: (avgScore * 0.6) + (tpsAvg * 0.4) // 60% votos, 40% velocidade
};
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

## Troubleshooting

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
