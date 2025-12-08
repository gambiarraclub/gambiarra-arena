# 🎯 Guia Passo a Passo - Do Zero ao Funcionamento

Este guia te leva do zero até ter a arena funcionando com clientes simulados.

## 🧠 Entenda o Fluxo ANTES de Começar

```
┌─────────────────────────────────────────────────────────────┐
│  1. SEED cria:                                              │
│     ✅ Sessão (com PIN 123456)                             │
│     ✅ Rodada (desafio de poesia)                          │
│     ❌ NÃO cria participantes!                             │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  2. Você INICIA o servidor (pnpm dev)                       │
│     → Servidor fica esperando na porta 3000                 │
│     → Telão fica disponível na porta 5173                   │
│     → Nenhum participante ainda!                            │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  3. Você ATIVA a rodada (curl POST /rounds/start)           │
│     → Rodada entra em modo "AO VIVO"                        │
│     → Servidor fica pronto para receber clientes            │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  4. Clientes SE CONECTAM (pnpm simulate)                    │
│     → 5 clientes conectam via WebSocket                     │
│     → Enviam mensagem "register" com PIN                    │
│     → Servidor CRIA 5 participantes no banco ← AQUI!       │
│     → Participantes aparecem no telão                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  5. Servidor ENVIA desafio para clientes                    │
│     → Mensagem "challenge" via WebSocket                    │
│     → Clientes começam a gerar tokens                       │
│     → Tokens voltam para servidor em tempo real             │
│     → Telão atualiza mostrando progresso                    │
└─────────────────────────────────────────────────────────────┘
```

**Resumo:** Participantes só existem DEPOIS que clientes conectam!

---

## 📋 Pré-requisitos

Você precisa ter instalado:
- Node.js 20 ou superior
- pnpm (gerenciador de pacotes)

```bash
# Verificar Node.js
node --version
# Deve mostrar v20.x.x ou superior

# Instalar pnpm se não tiver
npm install -g pnpm

# Verificar pnpm
pnpm --version
```

---

## 🚀 Passo 1: Instalar Dependências

**O que isso faz:** Baixa todas as bibliotecas necessárias para o projeto.

```bash
# Certifique-se de estar na raiz do projeto
cd /Users/filipecalegario/git/GAMBIARRA/gambiarra-club-framework-chatgpt

# Instalar todas as dependências
pnpm install
```

**Aguarde** até aparecer "Done" (pode levar 1-2 minutos).

---

## 🗄️ Passo 2: Configurar Banco de Dados

**O que isso faz:** Cria o banco de dados SQLite e suas tabelas.

```bash
# Ainda na raiz do projeto, rode:
pnpm --filter @gambiarra/server db:migrate
```

**Você verá:**
- ✅ "Generated Prisma Client"
- Uma mensagem sobre migração aplicada

---

## 🌱 Passo 3: Popular Banco com Dados de Teste

**O que isso faz:** Cria uma SESSÃO e uma RODADA de exemplo.

⚠️ **IMPORTANTE:** Participantes NÃO são criados aqui! Eles só aparecem quando clientes conectarem.

```bash
pnpm --filter @gambiarra/server seed
```

**Você verá:**
```
🌱 Seeding database...
🧹 Cleaning existing data...
✅ Session created: [algum-id]
🔑 PIN: 123456
📝 Round created: Round 1
   Prompt: Escreva uma poesia em métrica de xote pernambucano...

✨ Seed completed!
[instruções de próximos passos]
```

**Anote:**
- O PIN é **123456** (vamos usar depois!)
- O Round ID (você vai precisar dele!)

## 💡 Entendendo os Conceitos

Antes de continuar, entenda:

- **Sessão** = Uma "partida" da arena com PIN único
- **Rodada** = Um desafio dentro da sessão (ex: "escreva poesia")
- **Participante** = Criado AUTOMATICAMENTE quando um cliente conecta
- **Cliente** = Programa que roda no computador de quem vai participar

**Fluxo:**
1. Você cria Sessão + Rodada (com o seed)
2. Você inicia a Rodada (com curl)
3. Clientes se conectam → Participantes são criados automaticamente
4. Clientes recebem o desafio e começam a gerar texto

---

## 🖥️ Passo 4: Iniciar Servidor e Telão

**O que isso faz:** Liga o servidor backend (porta 3000) e o telão frontend (porta 5173).

**Abra um NOVO terminal** (deixe este rodando!) e execute:

```bash
cd /Users/filipecalegario/git/GAMBIARRA/gambiarra-club-framework-chatgpt

pnpm dev
```

**Você verá:**
```
╔═══════════════════════════════════════════════════════╗
║  🎮 Gambiarra LLM Club Arena Local                   ║
║  Server running on http://0.0.0.0:3000               ║
╚═══════════════════════════════════════════════════════╝

  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
```

**✅ SUCESSO!** Se você vir essas mensagens, servidor e telão estão rodando!

**Deixe este terminal aberto e rodando!**

---

## 🌐 Passo 5: Verificar se Está Funcionando

**Abra seu navegador** em:
- http://localhost:5173

Você deve ver o **telão da arena** (pode estar vazio por enquanto).

---

## 🤖 Passo 6: Conectar Clientes Simulados

⚠️ **IMPORTANTE:** Conecte os clientes ANTES de iniciar a rodada!

**Abra um SEGUNDO terminal novo** e rode:

```bash
pnpm simulate
```

**Você verá:**
```
🎮 Starting 5 simulated clients...

✓ Client 1 connected
✓ Client 2 connected
✓ Client 3 connected
✓ Client 4 connected
✓ Client 5 connected

✓ All 5 clients connected and ready
```

**✅ Clientes conectados!** Agora eles estão esperando o desafio.

**💡 Deixe este terminal rodando!** Os clientes precisam ficar conectados.

---

## 🎬 Passo 7: Iniciar a Rodada

**Agora sim, com os clientes conectados, vamos iniciar a rodada!**

**Abra um TERCEIRO terminal** e rode:

```bash
# Pegar o ID da rodada
curl http://localhost:3000/session | jq '.rounds[0].id'
```

**Copie o ID** e rode:

```bash
# Substitua pelo ID que você copiou
curl -X POST http://localhost:3000/rounds/start \
  -H "Content-Type: application/json" \
  -d '{"roundId":"COLE_O_ID_AQUI"}'
```

**🎉 AGORA SIM!** No terminal do `pnpm simulate` você verá:

```
[Client 1] Received challenge: Round 1
[Client 2] Received challenge: Round 1
...
[Client 1] Completed 89 tokens in 4.52s
```

---

## 🤖 RESUMO: Por que essa ordem?

**O que `pnpm simulate` faz:**

1. 🔌 Conecta 5 clientes ao servidor via WebSocket
2. 📝 Cada cliente se registra com um ID único (sim-1, sim-2, etc)
3. 👤 O servidor CRIA 5 participantes automaticamente no banco
4. 📢 Servidor envia o desafio da rodada para os 5 clientes
5. 🤖 Clientes geram tokens falsos automaticamente (mock)
6. 📡 Enviam os tokens de volta para o servidor em tempo real
7. 📺 Servidor atualiza o telão com os tokens

**No mesmo segundo terminal**, rode:

```bash
pnpm simulate
```

**Você verá:**
```
🎮 Starting 5 simulated clients...

✓ Client 1 connected
✓ Client 2 connected
✓ Client 3 connected
✓ Client 4 connected
✓ Client 5 connected

✓ All 5 clients connected and ready

[Client 1] Received challenge: Round 1
[Client 2] Received challenge: Round 1
...
[Client 1] Completed 89 tokens in 4.52s
[Client 2] Completed 76 tokens in 3.89s
...
```

**Agora SIM os participantes foram criados!** (antes não havia nenhum)

---

1. **Clientes conectam primeiro** → Ficam esperando
2. **Você inicia a rodada** → Servidor envia "challenge"
3. **Clientes recebem challenge** → Começam a gerar!

❌ **Se você iniciar a rodada ANTES dos clientes:**
- Os clientes conectam mas NÃO recebem o desafio
- Eles ficam parados esperando
- Nenhum token é gerado

---

## 👀 Passo 8: Ver no Telão

**Volte ao navegador** em http://localhost:5173

Você verá **EM TEMPO REAL**:
- ✅ Cards dos 5 clientes
- ✅ Indicador "Gerando" piscando em verde
- ✅ Barra de progresso enchendo
- ✅ Tokens aparecendo linha por linha!
- ✅ Contagem de tokens aumentando

**🎉 ESTÁ FUNCIONANDO DE VERDADE!**

---

## 🗳️ Passo 9: Testar Votação (Opcional)

**Abra uma nova aba** no navegador:
- http://localhost:5173/voting

1. Dê notas de 1-5 para cada cliente
2. Clique em "Enviar Votos"

---

## 📊 Passo 10: Ver Placar e Exportar (Opcional)

**Opção 1: Visualizar no telão (recomendado)**

Abra uma nova aba no navegador:
- http://localhost:5173/scoreboard

Você verá:
- 🥇🥈🥉 Pódio com as 3 melhores posições
- Média de votos e total de pontos de cada participante
- Número de votos recebidos
- Métricas de performance (tokens e TPS)
- Atualização automática a cada 3 segundos

**Opção 2: Via API (linha de comando)**

```bash
# Ver placar em JSON
curl http://localhost:3000/scoreboard | jq

# Exportar CSV
curl http://localhost:3000/export.csv > resultados.csv
```

---

## 🎯 Resumo Rápido - Ordem Correta ⚡

```bash
# Terminal 1 (servidor + telão) - deixe rodando
pnpm dev

# Terminal 2 - CONECTAR CLIENTES PRIMEIRO!
pnpm simulate
# ☝️ Deixe rodando! Clientes ficam esperando o desafio

# Terminal 3 - Agora sim, iniciar rodada
# 1. Pegar round ID
curl http://localhost:3000/session | jq '.rounds[0].id'

# 2. Iniciar rodada (cole o ID)
curl -X POST http://localhost:3000/rounds/start \
  -H "Content-Type: application/json" \
  -d '{"roundId":"COLE_O_ID_AQUI"}'

# 🎉 Agora os clientes recebem o desafio e começam a gerar!

# 4. Abrir navegador e ver acontecendo
# http://localhost:5173
```

**⚠️ ORDEM IMPORTA:**
1. ✅ Servidor rodando
2. ✅ Clientes conectados E esperando
3. ✅ AGORA iniciar a rodada
4. ✅ Tokens aparecem!

---

## 🛑 Parar Tudo

Para parar os servidores:

1. **Terminal do `pnpm dev`**: Pressione `Ctrl+C`
2. **Terminal do `pnpm simulate`**: Pressione `Ctrl+C`

---

## 🔄 Rodar de Novo

Se você já rodou uma vez e quer rodar de novo:

```bash
# 1. Limpar e recriar dados
pnpm --filter @gambiarra/server seed

# 2. Iniciar servidor (terminal 1)
pnpm dev

# 3. Terminal 2 - CONECTAR CLIENTES PRIMEIRO!
pnpm simulate
# Deixe rodando!

# 4. Terminal 3 - Agora iniciar rodada
# Pegar round ID
curl http://localhost:3000/session | jq '.rounds[0].id'

# Iniciar rodada
curl -X POST http://localhost:3000/rounds/start \
  -H "Content-Type: application/json" \
  -d '{"roundId":"COLE_ID"}'

# 🎉 Tokens começam a aparecer!
```

---

## 🆘 Problemas Comuns

### "Port 3000 already in use"
Algo já está usando a porta 3000.

**Solução:**
```bash
# Encontrar o processo
lsof -ti:3000

# Matar o processo (substitua PID)
kill -9 PID
```

### "No active session"
Você precisa rodar o seed primeiro.

**Solução:**
```bash
pnpm --filter @gambiarra/server seed
```

### Telão não atualiza / Nenhum token aparece
1. **Recarregue a página** (F5)
2. **Verifique a ORDEM:** Você conectou os clientes ANTES de iniciar a rodada?
3. **Se iniciou a rodada antes:** Pare os clientes (Ctrl+C) e rode `pnpm simulate` de novo
4. **Então inicie a rodada novamente** com curl POST /rounds/start

### "command not found: jq"
O `jq` é opcional, só para formatar JSON.

**Sem jq:**
```bash
# Pegar round ID
curl http://localhost:3000/session
# Procure manualmente por "rounds" -> [0] -> "id"
```

---

## ✅ Checklist de Sucesso

- [ ] `pnpm install` completou sem erros
- [ ] `pnpm --filter @gambiarra/server db:migrate` criou o banco
- [ ] `pnpm --filter @gambiarra/server seed` mostrou PIN 123456
- [ ] `pnpm dev` mostrou servidor na porta 3000 e Vite na 5173
- [ ] http://localhost:5173 abriu o telão
- [ ] Consegui pegar o round ID com curl
- [ ] Consegui iniciar a rodada com POST /rounds/start
- [ ] `pnpm simulate` conectou 5 clientes
- [ ] Telão mostra tokens aparecendo em tempo real

**Se todos marcados: 🎉 SUCESSO TOTAL!**

---

## 📞 Próximos Passos

Agora que está funcionando, você pode:

1. **Testar com Ollama real**: Ver [README.md](README.md) seção "Ollama"
2. **Criar novos desafios**: Mudar o prompt nas rodadas
3. **Usar em rede local**: Trocar `localhost` pelo IP da máquina
4. **Customizar pontuação**: Ver [README.md](README.md) seção "Alterando Pesos"

---

**Dúvidas?** Abra uma issue no GitHub ou consulte [README.md](README.md) para detalhes.

**Bora gambiarra! 🔧🎨**
