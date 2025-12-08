# 🎭 Guia de Ensaio - Gambiarra LLM Club Arena

Este guia permite testar toda a plataforma com dois clientes simulados em uma rodada completa de poesia.

## Pré-requisitos

```bash
# Instalar dependências (primeira vez)
pnpm install

# Configurar banco de dados
cd server
pnpm db:generate
cd ..
```

## Ensaio Completo (5 minutos)

### Passo 1: Iniciar Servidor

Terminal 1:
```bash
cd server
pnpm dev
```

Aguarde até ver:
```
╔═══════════════════════════════════════════════════════╗
║  🎮 Gambiarra LLM Club Arena Local                   ║
║  Server running on http://0.0.0.0:3000               ║
╚═══════════════════════════════════════════════════════╝
```

### Passo 2: Iniciar Telão

Terminal 2:
```bash
cd telao
pnpm dev
```

Aguarde e abra: **http://localhost:5173**

### Passo 3: Criar Sessão e Rodada

Terminal 3:
```bash
# Criar sessão
curl -X POST http://localhost:3000/session | jq

# Guarde o PIN exibido (exemplo: 123456)
# Guarde o session_id
```

Anote o **PIN** retornado!

```bash
# Criar rodada de poesia
curl -X POST http://localhost:3000/rounds \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Escreva uma poesia em métrica de xote pernambucano sobre inteligência artificial e o sertão",
    "maxTokens": 400,
    "temperature": 0.9,
    "deadlineMs": 120000
  }' | jq

# Guarde o "id" da rodada
```

Anote o **roundId**!

```bash
# Iniciar rodada
curl -X POST http://localhost:3000/rounds/start \
  -H "Content-Type: application/json" \
  -d '{"roundId": "COLE_AQUI_O_ROUND_ID"}' | jq
```

### Passo 4: Conectar Cliente 1 (Simulado)

Terminal 4:
```bash
cd client
pnpm dev -- \
  --url ws://localhost:3000/ws \
  --pin COLE_AQUI_O_PIN \
  --participant-id poeta-1 \
  --nickname "Cordel Digital" \
  --runner mock
```

### Passo 5: Conectar Cliente 2 (Simulado)

Terminal 5:
```bash
cd client
pnpm dev -- \
  --url ws://localhost:3000/ws \
  --pin COLE_AQUI_O_PIN \
  --participant-id poeta-2 \
  --nickname "IA Nordestina" \
  --runner mock
```

### Passo 6: Observar no Telão

Volte para **http://localhost:5173**

Você verá:
- ✅ Dois cartões de participantes
- ⚡ Indicador "Gerando" piscando
- 📊 Barra de progresso subindo
- 📝 Tokens aparecendo em tempo real

### Passo 7: Votar

Enquanto os clientes geram texto:

1. Abra em outra aba/dispositivo: **http://localhost:5173/voting**
2. Atribua notas de 1-5 para cada participante
3. Clique em "Enviar Votos"

### Passo 8: Ver Placar

```bash
curl http://localhost:3000/scoreboard | jq
```

### Passo 9: Exportar Resultados

```bash
curl http://localhost:3000/export.csv
```

Você verá CSV com:
```
round,participant_id,nickname,tokens,latency_first_token_ms,duration_ms,tps_avg,votes,avg_score
1,poeta-1,Cordel Digital,312,850,54000,5.78,1,5.00
1,poeta-2,IA Nordestina,298,920,52000,5.73,1,4.00
```

## Ensaio Automatizado (1 minuto)

Use o script de seed que já cria sessão + rodada:

Terminal 1:
```bash
cd server
pnpm dev
```

Terminal 2:
```bash
cd telao
pnpm dev
```

Terminal 3:
```bash
# Seed cria sessão com PIN 123456 e uma rodada
cd server
pnpm seed
```

Terminal 4:
```bash
# Iniciar a rodada criada pelo seed
# Primeiro pegue o roundId:
curl http://localhost:3000/session | jq '.rounds[0].id'

# Depois inicie:
curl -X POST http://localhost:3000/rounds/start \
  -H "Content-Type: application/json" \
  -d '{"roundId": "ROUND_ID_DO_SEED"}' | jq
```

Terminal 5:
```bash
# Simula 5 clientes automaticamente
pnpm simulate
```

Abra telão: **http://localhost:5173**

## Testando com Ollama Real

Se você tem Ollama instalado:

```bash
# Terminal 1: Servidor
cd server && pnpm dev

# Terminal 2: Telão
cd telao && pnpm dev

# Terminal 3: Criar sessão e rodada (como acima)

# Terminal 4: Cliente real
cd client
pnpm dev -- \
  --url ws://localhost:3000/ws \
  --pin 123456 \
  --participant-id meu-ollama \
  --nickname "Llama Local" \
  --runner ollama \
  --model llama3.1:8b

# Terminal 5: Cliente simulado para comparação
cd client
pnpm dev -- \
  --url ws://localhost:3000/ws \
  --pin 123456 \
  --participant-id simulado \
  --nickname "Mock Bot" \
  --runner mock
```

## Troubleshooting do Ensaio

**"No active session":**
```bash
# Criar nova sessão
curl -X POST http://localhost:3000/session | jq
```

**"Round not found":**
```bash
# Ver rodadas existentes
curl http://localhost:3000/session | jq '.rounds'

# Criar nova rodada
curl -X POST http://localhost:3000/rounds \
  -H "Content-Type: application/json" \
  -d '{"prompt": "teste", "maxTokens": 200}' | jq
```

**"Invalid PIN":**
- Use o PIN retornado na criação da sessão
- Ou use `123456` se usou `pnpm seed`

**Telão não atualiza:**
- Recarregue a página (F5)
- Verifique console do navegador (F12)
- Confirme que a rodada foi iniciada (`POST /rounds/start`)

**Cliente não conecta:**
```bash
# Verificar se servidor está rodando
curl http://localhost:3000/health
```

## Limpando para Novo Ensaio

```bash
# Resetar banco de dados
cd server
rm -f prisma/dev.db
pnpm db:migrate

# Seed novamente
pnpm seed
```

## Checklist de Sucesso

✅ Servidor iniciou sem erros
✅ Telão carregou em http://localhost:5173
✅ Sessão criada com PIN
✅ Rodada criada e iniciada
✅ Dois clientes conectaram
✅ Tokens aparecem no telão em tempo real
✅ Votação funciona
✅ Placar calcula corretamente
✅ CSV exporta com métricas

## Próximos Passos

Depois do ensaio bem-sucedido:

1. **Teste com LLM real**: Instale Ollama e use `--runner ollama`
2. **Múltiplos participantes**: Rode `pnpm simulate` para 5 clientes
3. **Rede local**: Substitua `localhost` pelo IP da máquina servidora
4. **QR Code**: Teste votação via mobile escaneando o QR do telão
5. **Prompts criativos**: Experimente os jogos sugeridos no README

---

**Dica:** Para demonstrações ao vivo, sempre tenha um cliente mock pronto como backup caso alguém tenha problemas com Ollama/LM Studio.
